use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

use crate::errors::{AppError, AppResult};

const MAX_IMAGE_SIZE: u64 = 25 * 1024 * 1024;

pub fn save(app: &tauri::AppHandle, source: &Path) -> AppResult<String> {
    let file = File::open(source).map_err(storage_error)?;
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_SIZE + 1)
        .read_to_end(&mut bytes)
        .map_err(storage_error)?;

    if bytes.len() as u64 > MAX_IMAGE_SIZE {
        return Err(AppError::new(
            "invalid_image",
            "Background image exceeds 25 MiB",
        ));
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| AppError::new("invalid_image", "Unsupported background image format"))?;
    if !valid_image(&extension, &bytes) {
        return Err(AppError::new(
            "invalid_image",
            "Unsupported background image format",
        ));
    }

    let directory = app
        .path()
        .app_data_dir()
        .map_err(storage_error)?
        .join("backgrounds");
    fs::create_dir_all(&directory).map_err(storage_error)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(storage_error)?
        .as_nanos();
    let destination = directory.join(format!("haze-{stamp}-{}.{}", std::process::id(), extension));
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .map_err(storage_error)?;
    if let Err(error) = output.write_all(&bytes) {
        let _ = fs::remove_file(&destination);
        return Err(storage_error(error));
    }
    Ok(destination.to_string_lossy().into_owned())
}

fn valid_image(extension: &str, bytes: &[u8]) -> bool {
    match extension {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => bytes.starts_with(b"\xff\xd8\xff"),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        _ => false,
    }
}

fn storage_error(error: impl std::fmt::Display) -> AppError {
    AppError::new("background_storage", error.to_string())
}

#[cfg(test)]
mod tests {
    use super::valid_image;

    #[test]
    fn rejects_mismatched_or_unsupported_images() {
        assert!(valid_image("png", b"\x89PNG\r\n\x1a\nrest"));
        assert!(valid_image("jpeg", b"\xff\xd8\xffrest"));
        assert!(valid_image("webp", b"RIFF1234WEBPrest"));
        assert!(!valid_image("png", b"\xff\xd8\xffrest"));
        assert!(!valid_image("svg", b"<svg></svg>"));
        assert!(!valid_image("gif", b"not an image"));
    }
}
