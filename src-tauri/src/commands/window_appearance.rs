use crate::errors::{AppError, AppResult};

#[tauri::command]
pub fn supports_window_translucency() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

#[tauri::command]
pub fn supports_window_background_blur() -> bool {
    cfg!(target_os = "macos")
}

#[tauri::command]
pub fn set_window_translucency(window: tauri::WebviewWindow, enabled: bool) -> AppResult<()> {
    if !supports_window_translucency() {
        return Err(AppError::new(
            "unsupported_platform",
            "Window translucency is not supported on this platform",
        ));
    }

    #[cfg(target_os = "macos")]
    {
        if enabled {
            crate::macos_glass::enable(&window)?;
        } else {
            crate::macos_glass::disable(&window)?;
        }
    }

    #[cfg(target_os = "windows")]
    {
        use tauri::window::{Color, Effect, EffectsBuilder};

        let window_error = |error: tauri::Error| AppError::new("window_effect", error.to_string());

        if enabled {
            window
                .set_effects(EffectsBuilder::new().effect(Effect::Acrylic).build())
                .map_err(window_error)?;
            window
                .set_background_color(Some(Color(0, 0, 0, 0)))
                .map_err(window_error)?;
        } else {
            window
                .set_background_color(Some(Color(19, 21, 27, 255)))
                .map_err(window_error)?;
            window.set_effects(None).map_err(window_error)?;
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = window;

    Ok(())
}

#[tauri::command]
pub fn set_window_background_blur(window: tauri::WebviewWindow, radius: u8) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    return crate::macos_glass::set_radius(&window, radius);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, radius);
        Ok(())
    }
}
