use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::io::{Read, Write};
use std::sync::{Mutex, mpsc};

#[derive(Default)]
pub struct TerminalState(Mutex<Option<Session>>);

impl TerminalState {
    pub fn shutdown(&self) {
        if let Ok(mut session) = self.0.lock() {
            session.take();
        }
    }
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    output: mpsc::Receiver<Vec<u8>>,
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.clamp(2, 500),
        rows: rows.clamp(1, 300),
        pixel_width: 0,
        pixel_height: 0,
    }
}

#[tauri::command]
pub fn terminal_open(
    state: tauri::State<'_, TerminalState>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut session = state.0.lock().map_err(|e| e.to_string())?;
    if session.is_some() {
        return Ok(());
    }
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) {
            "powershell.exe".into()
        } else {
            "/bin/sh".into()
        }
    });
    let mut command = CommandBuilder::new(shell);
    if !cfg!(windows) {
        command.arg("-l");
    }
    command.env("TERM", "xterm-256color");
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        command.cwd(home);
    }
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);
    // Bounded output provides backpressure instead of growing memory while hidden.
    let (sender, output) = mpsc::sync_channel(64);
    std::thread::spawn(move || {
        let mut buffer = [0; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    if sender.send(buffer[..count].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });
    *session = Some(Session {
        master: pair.master,
        writer,
        child,
        output,
    });
    Ok(())
}

#[derive(serde::Serialize)]
pub struct Output {
    data: Vec<u8>,
    exited: bool,
}

#[tauri::command]
pub fn terminal_read(state: tauri::State<'_, TerminalState>) -> Result<Output, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let session = guard.as_mut().ok_or("Terminal is not running")?;
    let mut data = Vec::new();
    let mut exited = false;
    for _ in 0..64 {
        match session.output.try_recv() {
            Ok(chunk) => data.extend(chunk),
            Err(mpsc::TryRecvError::Empty) => break,
            Err(mpsc::TryRecvError::Disconnected) => {
                exited = true;
                break;
            }
        }
    }
    Ok(Output { data, exited })
}

#[tauri::command]
pub fn terminal_write(state: tauri::State<'_, TerminalState>, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let session = guard.as_mut().ok_or("Terminal is not running")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    guard
        .as_ref()
        .ok_or("Terminal is not running")?
        .master
        .resize(size(cols, rows))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_close(state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    state.0.lock().map_err(|e| e.to_string())?.take();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_dimensions_are_bounded() {
        let small = size(0, 0);
        assert_eq!((small.cols, small.rows), (2, 1));
        let large = size(u16::MAX, u16::MAX);
        assert_eq!((large.cols, large.rows), (500, 300));
    }

    #[cfg(unix)]
    #[test]
    fn pty_executes_shell_and_preserves_output() {
        let pair = native_pty_system().openpty(size(80, 24)).unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut command = CommandBuilder::new("/bin/sh");
        command.args(["-c", "printf 'talo-pty-ready'"]);
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut output = Vec::new();
        let _ = reader.read_to_end(&mut output);
        assert!(child.wait().unwrap().success());
        assert!(String::from_utf8_lossy(&output).contains("talo-pty-ready"));
    }
}
