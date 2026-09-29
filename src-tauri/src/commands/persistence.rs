use tauri::State;

use crate::database::Database;
use crate::errors::{AppError, AppResult};
use crate::models::{Conversation, Message, MessageRole, MessageStatus, Project};
use crate::services::persistence;

// Each call owns a database path, not a shared Connection. SQLite work stays off Tokio threads.
async fn run<T: Send + 'static>(
    db: State<'_, Database>,
    operation: impl FnOnce(Database) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    let database = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || operation(database))
        .await
        .map_err(|error| AppError::new("storage", error.to_string()))?
}

#[tauri::command]
pub async fn create_project(
    db: State<'_, Database>,
    name: String,
    description: Option<String>,
) -> AppResult<Project> {
    run(db, move |db| {
        persistence::create_project(&db, name, description)
    })
    .await
}

#[tauri::command]
pub async fn list_projects(db: State<'_, Database>) -> AppResult<Vec<Project>> {
    run(db, move |db| persistence::list_projects(&db)).await
}

#[tauri::command]
pub async fn get_project(db: State<'_, Database>, project_id: String) -> AppResult<Project> {
    run(db, move |db| persistence::get_project(&db, project_id)).await
}

#[tauri::command]
pub async fn update_project(
    db: State<'_, Database>,
    project_id: String,
    name: String,
    description: Option<String>,
) -> AppResult<Project> {
    run(db, move |db| {
        persistence::update_project(&db, project_id, name, description)
    })
    .await
}

#[tauri::command]
pub async fn delete_project(db: State<'_, Database>, project_id: String) -> AppResult<()> {
    run(db, move |db| persistence::delete_project(&db, project_id)).await
}

#[tauri::command]
pub async fn create_conversation(
    db: State<'_, Database>,
    project_id: Option<String>,
    title: String,
) -> AppResult<Conversation> {
    run(db, move |db| {
        persistence::create_conversation(&db, project_id, title)
    })
    .await
}

#[tauri::command]
pub async fn list_conversations(
    db: State<'_, Database>,
    project_id: Option<String>,
) -> AppResult<Vec<Conversation>> {
    run(db, move |db| {
        persistence::list_conversations(&db, project_id)
    })
    .await
}

#[tauri::command]
pub async fn get_conversation(
    db: State<'_, Database>,
    conversation_id: String,
) -> AppResult<Conversation> {
    run(db, move |db| {
        persistence::get_conversation(&db, conversation_id)
    })
    .await
}

#[tauri::command]
pub async fn rename_conversation(
    db: State<'_, Database>,
    conversation_id: String,
    title: String,
) -> AppResult<Conversation> {
    run(db, move |db| {
        persistence::rename_conversation(&db, conversation_id, title)
    })
    .await
}

#[tauri::command]
pub async fn delete_conversation(
    db: State<'_, Database>,
    conversation_id: String,
) -> AppResult<()> {
    run(db, move |db| {
        persistence::delete_conversation(&db, conversation_id)
    })
    .await
}

#[tauri::command]
pub async fn create_message(
    db: State<'_, Database>,
    conversation_id: String,
    role: MessageRole,
    content: String,
    status: MessageStatus,
) -> AppResult<Message> {
    run(db, move |db| {
        persistence::create_message(&db, conversation_id, role, content, status)
    })
    .await
}

#[tauri::command]
pub async fn list_messages(
    db: State<'_, Database>,
    conversation_id: String,
) -> AppResult<Vec<Message>> {
    run(db, move |db| {
        persistence::list_messages(&db, conversation_id)
    })
    .await
}

#[tauri::command]
pub async fn update_message(
    db: State<'_, Database>,
    message_id: String,
    content: String,
    status: MessageStatus,
) -> AppResult<Message> {
    run(db, move |db| {
        persistence::update_message(&db, message_id, content, status)
    })
    .await
}

#[tauri::command]
pub async fn recover_interrupted_message(
    db: State<'_, Database>,
    message_id: String,
    content: String,
) -> AppResult<Message> {
    run(db, move |db| {
        persistence::recover_interrupted_message(&db, message_id, content)
    })
    .await
}
