mod agents;
#[cfg(target_os = "macos")]
mod app_icon;
mod commands;
mod database;
mod errors;
#[cfg(target_os = "macos")]
mod macos_glass;
mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
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
            commands::get_app_info,
            commands::chat_background::save_chat_background,
            commands::window_appearance::supports_window_translucency,
            commands::window_appearance::supports_window_background_blur,
            commands::window_appearance::set_window_translucency,
            commands::window_appearance::set_window_background_blur
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Talo");
}
