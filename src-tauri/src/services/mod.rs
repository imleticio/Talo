pub mod chat_background;

use serde::Serialize;

#[derive(Serialize)]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
}

pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Talo",
        version: env!("CARGO_PKG_VERSION"),
    }
}
