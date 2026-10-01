use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use rusqlite::{
    Connection, Error as SqlError, ErrorCode, OptionalExtension, Row, TransactionBehavior, params,
};
use uuid::Uuid;

use crate::errors::{AppError, AppResult};
use crate::models::{Conversation, Message, MessageRole, MessageStatus, Project};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSession {
    pub conversation_id: String,
    pub external_id: String,
}

const MIGRATIONS: [&str; 5] = [
    include_str!("migrations/001_core.sql"),
    include_str!("migrations/002_external_sessions.sql"),
    include_str!("migrations/003_message_streaming_order.sql"),
    include_str!("migrations/004_conversation_model.sql"),
    include_str!("migrations/005_conversation_branch.sql"),
];

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn external_session(
        &self,
        conversation_id: &str,
        provider: &str,
    ) -> AppResult<ExternalSession> {
        self.connect()?.query_row(
            "SELECT conversation_id, external_id FROM external_sessions WHERE conversation_id = ?1 AND provider = ?2",
            params![conversation_id, provider],
            |row| Ok(ExternalSession { conversation_id: row.get(0)?, external_id: row.get(1)? }),
        ).optional().map_err(sql_error)?.ok_or_else(|| not_found("External session"))
    }

    pub fn link_session(
        &self,
        conversation_id: &str,
        provider: &str,
        external_id: &str,
    ) -> AppResult<ExternalSession> {
        let mut connection = self.connect()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        if transaction
            .query_row(
                "SELECT 1 FROM external_sessions WHERE conversation_id = ?1 AND provider = ?2",
                params![conversation_id, provider],
                |_| Ok(()),
            )
            .optional()
            .map_err(sql_error)?
            .is_some()
        {
            return Err(AppError::new(
                "constraint",
                "Conversation already has an external session",
            ));
        }
        transaction.execute(
            "INSERT INTO external_sessions (id, conversation_id, provider, external_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![Uuid::new_v4().to_string(), conversation_id, provider, external_id, timestamp()],
        ).map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
        Ok(ExternalSession {
            conversation_id: conversation_id.to_owned(),
            external_id: external_id.to_owned(),
        })
    }

    pub fn initialize(directory: &Path) -> AppResult<Self> {
        fs::create_dir_all(directory)
            .map_err(|error| AppError::new("storage", error.to_string()))?;
        let database = Self {
            path: directory.join("talo.db"),
        };
        let mut connection = database.connect()?;
        // Acquire the writer lock before inspecting the schema version so two startups
        // cannot both attempt to apply the same migration.
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        let version: u32 = transaction
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(sql_error)?;
        if version as usize > MIGRATIONS.len() {
            return Err(AppError::new(
                "unsupported_schema",
                format!("Database schema version {version} is newer than this application"),
            ));
        }
        for (index, migration) in MIGRATIONS.iter().enumerate().skip(version as usize) {
            transaction.execute_batch(migration).map_err(sql_error)?;
            transaction
                .pragma_update(None, "user_version", (index + 1) as u32)
                .map_err(sql_error)?;
        }
        // Only recover after confirming the schema is supported and all migrations succeed.
        transaction
            .execute(
                "UPDATE messages SET status = 'interrupted', updated_at = ?1 WHERE status = 'streaming'",
                [timestamp()],
            )
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
        Ok(database)
    }

    fn connect(&self) -> AppResult<Connection> {
        let connection = Connection::open(&self.path).map_err(sql_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(sql_error)?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(sql_error)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(sql_error)?;
        Ok(connection)
    }

    pub fn create_project(&self, name: &str, description: Option<&str>) -> AppResult<Project> {
        let now = timestamp();
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: name.to_owned(),
            description: description.map(str::to_owned),
            created_at: now.clone(),
            updated_at: now,
        };
        self.connect()?
            .execute(
                "INSERT INTO projects VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    project.id,
                    project.name,
                    project.description,
                    project.created_at,
                    project.updated_at
                ],
            )
            .map_err(sql_error)?;
        Ok(project)
    }

    pub fn list_projects(&self) -> AppResult<Vec<Project>> {
        let connection = self.connect()?;
        let mut statement = connection
            .prepare("SELECT * FROM projects ORDER BY created_at, id")
            .map_err(sql_error)?;
        statement
            .query_map([], project_row)
            .map_err(sql_error)?
            .collect::<Result<_, _>>()
            .map_err(sql_error)
    }

    pub fn get_project(&self, id: &str) -> AppResult<Project> {
        self.connect()?
            .query_row("SELECT * FROM projects WHERE id = ?1", [id], project_row)
            .optional()
            .map_err(sql_error)?
            .ok_or_else(|| not_found("Project"))
    }

    pub fn update_project(
        &self,
        id: &str,
        name: &str,
        description: Option<&str>,
    ) -> AppResult<Project> {
        let connection = self.connect()?;
        let changed = connection
            .execute(
                "UPDATE projects SET name = ?2, description = ?3, updated_at = ?4 WHERE id = ?1",
                params![id, name, description, timestamp()],
            )
            .map_err(sql_error)?;
        if changed == 0 {
            return Err(not_found("Project"));
        }
        self.get_project(id)
    }

    pub fn delete_project(&self, id: &str) -> AppResult<()> {
        let changed = self
            .connect()?
            .execute("DELETE FROM projects WHERE id = ?1", [id])
            .map_err(sql_error)?;
        if changed == 0 {
            return Err(not_found("Project"));
        }
        Ok(())
    }

    pub fn create_conversation(
        &self,
        project_id: Option<&str>,
        title: &str,
    ) -> AppResult<Conversation> {
        self.create_conversation_with_repository(project_id, title, None, None)
    }

    pub fn create_conversation_with_repository(
        &self,
        project_id: Option<&str>,
        title: &str,
        repository_path: Option<&str>,
        branch: Option<&str>,
    ) -> AppResult<Conversation> {
        let now = timestamp();
        let conversation = Conversation {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.map(str::to_owned),
            title: title.to_owned(),
            created_at: now.clone(),
            updated_at: now,
            last_provider_id: None,
            last_model_id: None,
            repository_path: repository_path.map(str::to_owned),
            branch: branch.map(str::to_owned),
            agent_id: None,
        };
        self.connect()?
            .execute(
                "INSERT INTO conversations (id, project_id, title, created_at, updated_at, repository_path, branch) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    conversation.id,
                    conversation.project_id,
                    conversation.title,
                    conversation.created_at,
                    conversation.updated_at,
                    conversation.repository_path,
                    conversation.branch
                ],
            )
            .map_err(sql_error)?;
        Ok(conversation)
    }

    pub fn list_conversations(&self, project_id: Option<&str>) -> AppResult<Vec<Conversation>> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT conversations.*, (SELECT provider FROM external_sessions WHERE conversation_id = conversations.id ORDER BY created_at DESC, id DESC LIMIT 1) AS agent_id FROM conversations WHERE (?1 IS NULL OR project_id = ?1) ORDER BY created_at, id"
        ).map_err(sql_error)?;
        statement
            .query_map([project_id], conversation_row)
            .map_err(sql_error)?
            .collect::<Result<_, _>>()
            .map_err(sql_error)
    }

    pub fn get_conversation(&self, id: &str) -> AppResult<Conversation> {
        self.connect()?
            .query_row(
                "SELECT conversations.*, (SELECT provider FROM external_sessions WHERE conversation_id = conversations.id ORDER BY created_at DESC, id DESC LIMIT 1) AS agent_id FROM conversations WHERE id = ?1",
                [id],
                conversation_row,
            )
            .optional()
            .map_err(sql_error)?
            .ok_or_else(|| not_found("Conversation"))
    }

    pub fn rename_conversation(&self, id: &str, title: &str) -> AppResult<Conversation> {
        let changed = self
            .connect()?
            .execute(
                "UPDATE conversations SET title = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, title, timestamp()],
            )
            .map_err(sql_error)?;
        if changed == 0 {
            return Err(not_found("Conversation"));
        }
        self.get_conversation(id)
    }

    pub fn set_conversation_model(
        &self,
        id: &str,
        model: Option<&(String, String)>,
    ) -> AppResult<()> {
        let changed = self
            .connect()?
            .execute(
                "UPDATE conversations SET last_provider_id = ?2, last_model_id = ?3 WHERE id = ?1",
                params![id, model.map(|model| &model.0), model.map(|model| &model.1)],
            )
            .map_err(sql_error)?;
        if changed == 0 {
            return Err(not_found("Conversation"));
        }
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> AppResult<()> {
        let changed = self
            .connect()?
            .execute("DELETE FROM conversations WHERE id = ?1", [id])
            .map_err(sql_error)?;
        if changed == 0 {
            return Err(not_found("Conversation"));
        }
        Ok(())
    }

    pub fn create_message(
        &self,
        conversation_id: &str,
        role: MessageRole,
        content: &str,
        status: MessageStatus,
    ) -> AppResult<Message> {
        let now = timestamp();
        let message = Message {
            id: Uuid::new_v4().to_string(),
            conversation_id: conversation_id.to_owned(),
            sequence: 0,
            role,
            content: content.to_owned(),
            status,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let mut connection = self.connect()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        let sequence: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM messages WHERE conversation_id = ?1",
                [conversation_id],
                |row| row.get(0),
            )
            .map_err(sql_error)?;
        transaction
            .execute(
                "INSERT INTO messages (id, conversation_id, sequence, role, content, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    message.id,
                    message.conversation_id,
                    sequence,
                    role.as_str(),
                    message.content,
                    status.as_str(),
                    now,
                    now
                ],
            )
            .map_err(sql_error)?;
        transaction
            .execute(
                "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
                params![conversation_id, now],
            )
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
        Ok(Message {
            sequence,
            ..message
        })
    }

    pub fn list_messages(&self, conversation_id: &str) -> AppResult<Vec<Message>> {
        let connection = self.connect()?;
        // Distinguish an empty conversation from a missing one.
        connection
            .query_row(
                "SELECT 1 FROM conversations WHERE id = ?1",
                [conversation_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(sql_error)?
            .ok_or_else(|| not_found("Conversation"))?;
        let mut statement = connection
            .prepare("SELECT * FROM messages WHERE conversation_id = ?1 ORDER BY sequence")
            .map_err(sql_error)?;
        statement
            .query_map([conversation_id], message_row)
            .map_err(sql_error)?
            .collect::<Result<_, _>>()
            .map_err(sql_error)
    }

    pub fn update_message(
        &self,
        id: &str,
        content: &str,
        status: MessageStatus,
        validate_transition: impl FnOnce(MessageStatus, MessageStatus) -> AppResult<()>,
    ) -> AppResult<Message> {
        let mut connection = self.connect()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        let previous = transaction
            .query_row("SELECT * FROM messages WHERE id = ?1", [id], message_row)
            .optional()
            .map_err(sql_error)?
            .ok_or_else(|| not_found("Message"))?;
        validate_transition(previous.status, status)?;
        let now = timestamp();
        transaction
            .execute(
                "UPDATE messages SET content = ?2, status = ?3, updated_at = ?4 WHERE id = ?1",
                params![id, content, status.as_str(), now],
            )
            .map_err(sql_error)?;
        let message = transaction
            .query_row("SELECT * FROM messages WHERE id = ?1", [id], message_row)
            .map_err(sql_error)?;
        transaction
            .execute(
                "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
                params![message.conversation_id, now],
            )
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
        Ok(message)
    }
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Micros, true)
}

fn not_found(entity: &str) -> AppError {
    AppError::new("not_found", format!("{entity} not found"))
}

fn sql_error(error: SqlError) -> AppError {
    match &error {
        SqlError::SqliteFailure(failure, _) if failure.code == ErrorCode::ConstraintViolation => {
            AppError::new(
                "constraint",
                "Database relationship or value constraint failed",
            )
        }
        _ => AppError::new("storage", error.to_string()),
    }
}

fn project_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn conversation_row(row: &Row<'_>) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        last_provider_id: row.get(5)?,
        last_model_id: row.get(6)?,
        repository_path: row.get(7)?,
        branch: row.get(8)?,
        agent_id: row.get("agent_id")?,
    })
}

fn message_row(row: &Row<'_>) -> rusqlite::Result<Message> {
    let role: String = row.get(3)?;
    let status: String = row.get(5)?;
    let invalid = |column| {
        SqlError::InvalidColumnType(column, "invalid enum".into(), rusqlite::types::Type::Text)
    };
    let role = match role.as_str() {
        "system" => MessageRole::System,
        "user" => MessageRole::User,
        "assistant" => MessageRole::Assistant,
        "tool" => MessageRole::Tool,
        _ => return Err(invalid(3)),
    };
    let status = match status.as_str() {
        "completed" => MessageStatus::Completed,
        "streaming" => MessageStatus::Streaming,
        "failed" => MessageStatus::Failed,
        "interrupted" => MessageStatus::Interrupted,
        _ => return Err(invalid(5)),
    };
    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        sequence: row.get(2)?,
        role,
        content: row.get(4)?,
        status,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}
