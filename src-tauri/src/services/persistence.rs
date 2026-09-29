use uuid::Uuid;

use crate::database::Database;
use crate::errors::{AppError, AppResult};
use crate::models::{Conversation, Message, MessageRole, MessageStatus, Project};

fn id(value: &str) -> AppResult<()> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| AppError::new("validation", "Invalid UUID"))
}

fn required(value: &str, field: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err(AppError::new("validation", format!("Invalid {field}")));
    }
    Ok(trimmed.to_owned())
}

fn valid_description(value: Option<String>) -> AppResult<Option<String>> {
    value.map(|text| required(&text, "description")).transpose()
}

fn message_content(content: String, status: MessageStatus) -> AppResult<String> {
    if content.contains('\0') || (status == MessageStatus::Completed && content.trim().is_empty()) {
        return Err(AppError::new("validation", "Invalid message content"));
    }
    // Preserve whitespace and empty drafts: a streaming token can itself be whitespace.
    Ok(content)
}

fn streaming_transition(previous: MessageStatus, next: MessageStatus) -> AppResult<()> {
    if previous == MessageStatus::Streaming
        && matches!(
            next,
            MessageStatus::Streaming
                | MessageStatus::Completed
                | MessageStatus::Failed
                | MessageStatus::Interrupted
        )
    {
        return Ok(());
    }
    Err(AppError::new(
        "validation",
        "Invalid message status transition",
    ))
}

fn recovery_transition(previous: MessageStatus, next: MessageStatus) -> AppResult<()> {
    if previous == MessageStatus::Interrupted && next == MessageStatus::Completed {
        return Ok(());
    }
    Err(AppError::new(
        "validation",
        "Invalid message recovery transition",
    ))
}

pub fn create_project(
    db: &Database,
    name: String,
    description: Option<String>,
) -> AppResult<Project> {
    db.create_project(
        &required(&name, "name")?,
        valid_description(description)?.as_deref(),
    )
}

pub fn list_projects(db: &Database) -> AppResult<Vec<Project>> {
    db.list_projects()
}

pub fn get_project(db: &Database, project_id: String) -> AppResult<Project> {
    id(&project_id)?;
    db.get_project(&project_id)
}

pub fn update_project(
    db: &Database,
    project_id: String,
    name: String,
    description: Option<String>,
) -> AppResult<Project> {
    id(&project_id)?;
    db.update_project(
        &project_id,
        &required(&name, "name")?,
        valid_description(description)?.as_deref(),
    )
}

pub fn delete_project(db: &Database, project_id: String) -> AppResult<()> {
    id(&project_id)?;
    db.delete_project(&project_id)
}

pub fn create_conversation(
    db: &Database,
    project_id: Option<String>,
    title: String,
) -> AppResult<Conversation> {
    if let Some(ref project_id) = project_id {
        id(project_id)?;
    }
    db.create_conversation(project_id.as_deref(), &required(&title, "title")?)
}

// No filter means all conversations, including those not assigned to a project.
pub fn list_conversations(
    db: &Database,
    project_id: Option<String>,
) -> AppResult<Vec<Conversation>> {
    if let Some(ref project_id) = project_id {
        id(project_id)?;
    }
    db.list_conversations(project_id.as_deref())
}

pub fn get_conversation(db: &Database, conversation_id: String) -> AppResult<Conversation> {
    id(&conversation_id)?;
    db.get_conversation(&conversation_id)
}

pub fn rename_conversation(
    db: &Database,
    conversation_id: String,
    title: String,
) -> AppResult<Conversation> {
    id(&conversation_id)?;
    db.rename_conversation(&conversation_id, &required(&title, "title")?)
}

pub fn delete_conversation(db: &Database, conversation_id: String) -> AppResult<()> {
    id(&conversation_id)?;
    db.delete_conversation(&conversation_id)
}

pub fn create_message(
    db: &Database,
    conversation_id: String,
    role: MessageRole,
    content: String,
    status: MessageStatus,
) -> AppResult<Message> {
    id(&conversation_id)?;
    if status == MessageStatus::Interrupted
        || (status == MessageStatus::Streaming && !matches!(role, MessageRole::Assistant))
    {
        return Err(AppError::new(
            "validation",
            "Invalid initial message status",
        ));
    }
    db.create_message(
        &conversation_id,
        role,
        &message_content(content, status)?,
        status,
    )
}

pub fn list_messages(db: &Database, conversation_id: String) -> AppResult<Vec<Message>> {
    id(&conversation_id)?;
    db.list_messages(&conversation_id)
}

pub fn update_message(
    db: &Database,
    message_id: String,
    content: String,
    status: MessageStatus,
) -> AppResult<Message> {
    id(&message_id)?;
    db.update_message(
        &message_id,
        &message_content(content, status)?,
        status,
        streaming_transition,
    )
}

pub fn recover_interrupted_message(
    db: &Database,
    message_id: String,
    content: String,
) -> AppResult<Message> {
    id(&message_id)?;
    db.update_message(
        &message_id,
        &message_content(content, MessageStatus::Completed)?,
        MessageStatus::Completed,
        recovery_transition,
    )
}
