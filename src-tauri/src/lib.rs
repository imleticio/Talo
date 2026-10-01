pub mod agents;
#[cfg(target_os = "macos")]
mod app_icon;
mod commands;
pub mod database;
pub mod errors;
#[cfg(target_os = "macos")]
mod macos_glass;
pub mod models;
pub mod services;
mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(terminal::TerminalState::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.state::<terminal::TerminalState>().shutdown();
            }
        })
        .setup(|app| {
            use tauri::Manager;
            let directory = app.path().app_data_dir()?;
            let database = database::Database::initialize(&directory)?;
            let adapter = agents::opencode::OpenCodeAdapter::new(directory)?;
            app.manage(services::agent::AgentService::new(
                database.clone(),
                std::sync::Arc::new(adapter),
            ));
            app.manage(database);
            #[cfg(target_os = "macos")]
            {
                app_icon::set_dock_icon()?;
                let window = app
                    .get_webview_window("main")
                    .ok_or("missing main window")?;
                macos_glass::prepare_launch(&window)?;
            }
            #[cfg(not(target_os = "macos"))]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            terminal::terminal_open,
            terminal::terminal_read,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            commands::get_app_info,
            commands::git::git_repository,
            commands::git::git_switch_branch,
            commands::github::github_pr_status,
            commands::github::github_repository,
            commands::github::github_create_pr,
            commands::github::github_merge_pr,
            commands::chat_background::save_chat_background,
            commands::window_appearance::supports_window_translucency,
            commands::window_appearance::supports_window_background_blur,
            commands::window_appearance::set_window_translucency,
            commands::window_appearance::set_window_background_blur,
            commands::persistence::create_project,
            commands::persistence::list_projects,
            commands::persistence::get_project,
            commands::persistence::update_project,
            commands::persistence::delete_project,
            commands::persistence::create_conversation,
            commands::persistence::list_conversations,
            commands::persistence::get_conversation,
            commands::persistence::rename_conversation,
            commands::persistence::delete_conversation,
            commands::persistence::create_message,
            commands::persistence::list_messages,
            commands::persistence::update_message,
            commands::persistence::recover_interrupted_message,
            commands::agent::opencode_status,
            commands::agent::opencode_models,
            commands::agent::opencode_create_session,
            commands::agent::opencode_get_session,
            commands::agent::opencode_send_message,
            commands::agent::opencode_cancel
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Talo");
}
