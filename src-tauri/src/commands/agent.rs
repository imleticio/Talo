use tauri::{AppHandle, Emitter, State};

use crate::agents::{AgentInfo, AgentModel, AgentModelChoice};
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
) -> AppResult<Message> {
    service
        .send(conversation_id, content, model, move |event| {
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
