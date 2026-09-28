//! Native blur behind the WKWebView; the web UI only supplies the tint.

use std::ffi::{c_char, c_int, c_void};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU8, Ordering};

use objc2::MainThreadOnly;
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSColor, NSUserInterfaceItemIdentification,
    NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView,
    NSWindow, NSWindowOrderingMode,
};
use objc2_foundation::NSString;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::WebviewWindow;

use crate::errors::{AppError, AppResult};

const BACKING_ID: &str = "talo.glass-backing";
const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;
const DEFAULT_RADIUS: u8 = 24;
static RADIUS: AtomicU8 = AtomicU8::new(DEFAULT_RADIUS);

type Connection = usize;
type SetBlur = unsafe extern "C" fn(Connection, c_int, c_int) -> c_int;
type GetConnection = unsafe extern "C" fn() -> Connection;

unsafe extern "C" {
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}

fn native_window(window: &WebviewWindow) -> AppResult<objc2::rc::Retained<NSWindow>> {
    let handle = window.window_handle().map_err(native_error)?;
    let RawWindowHandle::AppKit(appkit) = handle.as_raw() else {
        return Err(native_error("Expected an AppKit window"));
    };
    let view = unsafe { &*appkit.ns_view.as_ptr().cast::<objc2_app_kit::NSView>() };
    view.window()
        .ok_or_else(|| native_error("AppKit window is unavailable"))
}

fn native_error(error: impl std::fmt::Display) -> AppError {
    AppError::new("window_effect", error.to_string())
}

fn backing(window: &NSWindow, enabled: bool) {
    let Some(content) = window.contentView() else {
        return;
    };
    let identifier = NSString::from_str(BACKING_ID);
    if let Some(view) = content
        .subviews()
        .iter()
        .find(|view| view.identifier().as_deref() == Some(&identifier))
    {
        view.setHidden(!enabled);
        return;
    }
    if !enabled {
        return;
    }

    let view = NSVisualEffectView::initWithFrame(
        NSVisualEffectView::alloc(window.mtm()),
        content.bounds(),
    );
    view.setIdentifier(Some(&identifier));
    view.setMaterial(NSVisualEffectMaterial::UnderWindowBackground);
    view.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    view.setState(NSVisualEffectState::Active);
    view.setAlphaValue(0.01);
    view.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    content.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Below, None);
}

pub fn prepare_launch(window: &WebviewWindow) -> AppResult<()> {
    let native = native_window(window)?;
    backing(&native, false);
    native.setOpaque(true);
    native.setBackgroundColor(Some(&NSColor::colorWithRed_green_blue_alpha(
        19.0 / 255.0,
        21.0 / 255.0,
        27.0 / 255.0,
        1.0,
    )));
    Ok(())
}

pub fn enable(window: &WebviewWindow) -> AppResult<()> {
    let native = native_window(window)?;
    // Resolve first: never expose an unfiltered desktop if the private API is absent.
    let (set_blur, connection) = blur_api()?;
    backing(&native, true);
    apply_blur(
        &native,
        set_blur,
        connection,
        RADIUS.load(Ordering::Relaxed),
    );
    native.setOpaque(false);
    native.setBackgroundColor(Some(&NSColor::clearColor().colorWithAlphaComponent(0.01)));
    native.setHasShadow(true);
    native.invalidateShadow();
    Ok(())
}

pub fn disable(window: &WebviewWindow) -> AppResult<()> {
    let native = native_window(window)?;
    prepare_launch(window)?;
    if let Ok((set_blur, connection)) = blur_api() {
        apply_blur(&native, set_blur, connection, 0);
    }
    Ok(())
}

pub fn set_radius(window: &WebviewWindow, radius: u8) -> AppResult<()> {
    let radius = radius.clamp(1, 64);
    // Each command receives its calling window; only reapply when that window is glass.
    let native = native_window(window)?;
    if !native.isOpaque() {
        let (set_blur, connection) = blur_api()?;
        apply_blur(&native, set_blur, connection, radius);
    }
    RADIUS.store(radius, Ordering::Relaxed);
    Ok(())
}

fn apply_blur(window: &NSWindow, set_blur: SetBlur, connection: Connection, radius: u8) {
    let number = window.windowNumber();
    if number > 0 {
        unsafe { set_blur(connection, number as c_int, radius as c_int) };
    }
}

fn blur_api() -> AppResult<(SetBlur, Connection)> {
    static SET: OnceLock<Option<SetBlur>> = OnceLock::new();
    static GET: OnceLock<Option<GetConnection>> = OnceLock::new();
    let set = (*SET.get_or_init(|| resolve(b"CGSSetWindowBackgroundBlurRadius\0")))
        .ok_or_else(|| native_error("WindowServer blur is unavailable"))?;
    let get = (*GET.get_or_init(|| {
        resolve(b"CGSDefaultConnectionForThread\0").or_else(|| resolve(b"CGSMainConnectionID\0"))
    }))
    .ok_or_else(|| native_error("WindowServer connection is unavailable"))?;
    let connection = unsafe { get() };
    if connection == 0 {
        return Err(native_error("WindowServer connection is unavailable"));
    }
    Ok((set, connection))
}

fn resolve<T>(symbol: &[u8]) -> Option<T> {
    let pointer = unsafe { dlsym(RTLD_DEFAULT, symbol.as_ptr().cast()) };
    (!pointer.is_null()).then(|| unsafe { std::mem::transmute_copy(&pointer) })
}
