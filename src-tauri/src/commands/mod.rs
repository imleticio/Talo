pub(crate) mod chat_background;
pub(crate) mod git;
pub(crate) mod persistence;
pub(crate) mod window_appearance;

use crate::errors::AppResult;
use crate::services::{self, AppInfo};

#[tauri::command]
pub async fn get_app_info() -> AppResult<AppInfo> {
    Ok(services::get_app_info())
}
pub(crate) mod agent;
