use tauri::{AppHandle, Emitter, State};

use crate::agents::{AgentInfo, AgentModel, AgentModelChoice, AgentSkill, PromptContext};
use crate::database::ExternalSession;
use crate::errors::AppResult;
use crate::models::Message;
use crate::services::agent::AgentService;

#[tauri::command]
pub async fn opencode_status(service: State<'_, AgentService>) -> AppResult<AgentInfo> {
    service.status().await
}

#[tauri::command]
pub async fn opencode_models(service: State<'_, AgentService>) -> AppResult<Vec<AgentModel>> {
    service.models().await
}

#[tauri::command]
pub async fn opencode_skills(
    service: State<'_, AgentService>,
    directory: Option<String>,
) -> AppResult<Vec<AgentSkill>> {
    service.skills(directory).await
}

#[tauri::command]
pub async fn opencode_files(
    service: State<'_, AgentService>,
    directory: String,
    query: String,
) -> AppResult<Vec<String>> {
    service.files(directory, query).await
}

#[tauri::command]
pub async fn opencode_create_session(
    service: State<'_, AgentService>,
    conversation_id: String,
) -> AppResult<ExternalSession> {
    service.create_session(conversation_id).await
}

#[tauri::command]
pub async fn opencode_get_session(
    service: State<'_, AgentService>,
    conversation_id: String,
) -> AppResult<ExternalSession> {
    service.get_session(conversation_id).await
}

#[tauri::command]
pub async fn opencode_send_message(
    service: State<'_, AgentService>,
    app: AppHandle,
    conversation_id: String,
    content: String,
    model: Option<AgentModelChoice>,
    context: Option<PromptContext>,
) -> AppResult<Message> {
    service
        .send_with_context(conversation_id, content, model, context, move |event| {
            let _ = app.emit("agent:update", event);
        })
        .await
}

#[tauri::command]
pub async fn opencode_cancel(
    service: State<'_, AgentService>,
    app: AppHandle,
    conversation_id: String,
) -> AppResult<()> {
    service
        .cancel(conversation_id, move |event| {
            let _ = app.emit("agent:update", event);
        })
        .await
}
