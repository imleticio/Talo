use std::path::PathBuf;

use crate::errors::{AppError, AppResult};
use crate::services::chat_background;

#[tauri::command]
pub async fn save_chat_background(app: tauri::AppHandle, path: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || chat_background::save(&app, &PathBuf::from(path)))
        .await
        .map_err(|error| AppError::new("background_storage", error.to_string()))?
}
