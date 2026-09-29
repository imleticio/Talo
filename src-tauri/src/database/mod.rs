use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, Error as SqlError, ErrorCode, OptionalExtension, Row, params};
use uuid::Uuid;

use crate::errors::{AppError, AppResult};
use crate::models::{Conversation, Message, MessageRole, MessageStatus, Project};

const MIGRATIONS: [&str; 2] = [
    include_str!("migrations/001_core.sql"),
    include_str!("migrations/002_external_sessions.sql"),
];

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn initialize(directory: &Path) -> AppResult<Self> {
        fs::create_dir_all(directory)
            .map_err(|error| AppError::new("storage", error.to_string()))?;
        let database = Self {
            path: directory.join("talo.db"),
        };
        let mut connection = database.connect()?;
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(sql_error)?;
        if version as usize > MIGRATIONS.len() {
            return Err(AppError::new(
                "unsupported_schema",
                format!("Database schema version {version} is newer than this application"),
            ));
        }
        for (index, migration) in MIGRATIONS.iter().enumerate().skip(version as usize) {
            let transaction = connection.transaction().map_err(sql_error)?;
            transaction.execute_batch(migration).map_err(sql_error)?;
            transaction
                .pragma_update(None, "user_version", (index + 1) as u32)
                .map_err(sql_error)?;
            transaction.commit().map_err(sql_error)?;
        }
        // Only recover after confirming the schema is supported and all migrations succeed.
        connection
            .execute(
                "UPDATE messages SET status = 'interrupted', updated_at = ?1 WHERE status = 'streaming'",
                [timestamp()],
            )
            .map_err(sql_error)?;
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
        let now = timestamp();
        let conversation = Conversation {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.map(str::to_owned),
            title: title.to_owned(),
            created_at: now.clone(),
            updated_at: now,
        };
        self.connect()?
            .execute(
                "INSERT INTO conversations VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    conversation.id,
                    conversation.project_id,
                    conversation.title,
                    conversation.created_at,
                    conversation.updated_at
                ],
            )
            .map_err(sql_error)?;
        Ok(conversation)
    }

    pub fn list_conversations(&self, project_id: Option<&str>) -> AppResult<Vec<Conversation>> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT * FROM conversations WHERE (?1 IS NULL OR project_id = ?1) ORDER BY created_at, id"
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
                "SELECT * FROM conversations WHERE id = ?1",
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
            role,
            content: content.to_owned(),
            status,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let mut connection = self.connect()?;
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute(
                "INSERT INTO messages VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    message.id,
                    message.conversation_id,
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
        Ok(message)
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
            .prepare("SELECT * FROM messages WHERE conversation_id = ?1 ORDER BY created_at, rowid")
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
    ) -> AppResult<Message> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction().map_err(sql_error)?;
        let now = timestamp();
        let changed = transaction
            .execute(
                "UPDATE messages SET content = ?2, status = ?3, updated_at = ?4 WHERE id = ?1",
                params![id, content, status.as_str(), now],
            )
            .map_err(sql_error)?;
        if changed == 0 {
            return Err(not_found("Message"));
        }
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
    })
}

fn message_row(row: &Row<'_>) -> rusqlite::Result<Message> {
    let role: String = row.get(2)?;
    let status: String = row.get(4)?;
    let invalid = |column| {
        SqlError::InvalidColumnType(column, "invalid enum".into(), rusqlite::types::Type::Text)
    };
    let role = match role.as_str() {
        "system" => MessageRole::System,
        "user" => MessageRole::User,
        "assistant" => MessageRole::Assistant,
        "tool" => MessageRole::Tool,
        _ => return Err(invalid(2)),
    };
    let status = match status.as_str() {
        "completed" => MessageStatus::Completed,
        "streaming" => MessageStatus::Streaming,
        "failed" => MessageStatus::Failed,
        "interrupted" => MessageStatus::Interrupted,
        _ => return Err(invalid(4)),
    };
    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role,
        content: row.get(3)?,
        status,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}
