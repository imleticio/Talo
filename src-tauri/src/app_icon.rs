use objc2::AnyThread;
use objc2_app_kit::{NSApplication, NSImage};
use objc2_foundation::{MainThreadMarker, NSData};

pub fn set_dock_icon() -> Result<(), Box<dyn std::error::Error>> {
    let main_thread = MainThreadMarker::new().ok_or("App icon must be set on the main thread")?;
    let data = NSData::with_bytes(include_bytes!("../icons/icon.png"));
    let icon = NSImage::initWithData(NSImage::alloc(), &data)
        .ok_or("Failed to decode the Talo app icon")?;

    // The .app bundle uses icon.icns; tauri dev runs an unbundled binary and needs this Dock icon.
    unsafe { NSApplication::sharedApplication(main_thread).setApplicationIconImage(Some(&icon)) };
    Ok(())
}
