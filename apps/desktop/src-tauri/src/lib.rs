// PRIVIA desktop shell.
//
// The shell is deliberately thin. It owns three things the web view cannot do
// safely on its own:
//
// 1. The backend's lifecycle. It starts the bundled backend on a free loopback
//    port with a per-launch API token, watches it, and stops it on exit. The
//    backend also exits by itself if this process dies (it watches stdin).
// 2. A native folder picker, so the user can grant a folder without typing a
//    path. Choosing a folder grants nothing on its own: the backend validates
//    it and the user still has to allow `files:read`.
// 3. Opening https links in the user's browser, so a link in a reply never
//    navigates the app window away.
//
// The web view gets no shell, filesystem or dialog permissions (see
// capabilities/main.json). Nothing here reads files or runs arbitrary commands.

use std::collections::VecDeque;
use std::net::TcpListener;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Lines of backend output kept for the troubleshooting screen.
const LOG_LINES: usize = 80;

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
enum BackendState {
    /// Started, not known to have exited. The UI polls /health for readiness.
    Running,
    /// The process exited; the UI shows the code and the last log lines.
    Exited { code: Option<i32> },
    /// The process could not be started at all.
    Failed { message: String },
    /// A developer is running the backend separately (`make dev-api`).
    External,
}

struct Backend {
    api_base: String,
    token: String,
    port: u16,
    managed: bool,
    child: Mutex<Option<CommandChild>>,
    state: Mutex<BackendState>,
    log: Mutex<VecDeque<String>>,
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    api_base: String,
    token: String,
    platform: String,
    managed_backend: bool,
}

#[derive(Serialize)]
struct BackendStatus {
    state: BackendState,
    log_tail: Vec<String>,
}

/// A 256-bit random token, hex encoded.
fn new_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("the operating system has no random source");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Ask the OS for a free loopback port.
fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(8756)
}

impl Backend {
    fn new() -> Self {
        // Developers can point the shell at a backend they run themselves.
        // Release builds always manage their own, on loopback.
        if cfg!(debug_assertions) {
            if let Ok(url) = std::env::var("PRIVIA_API_URL") {
                return Backend {
                    api_base: url,
                    token: std::env::var("PRIVIA_API_TOKEN").unwrap_or_default(),
                    port: 0,
                    managed: false,
                    child: Mutex::new(None),
                    state: Mutex::new(BackendState::External),
                    log: Mutex::new(VecDeque::new()),
                };
            }
        }
        let port = free_port();
        Backend {
            api_base: format!("http://127.0.0.1:{port}"),
            token: new_token(),
            port,
            managed: true,
            child: Mutex::new(None),
            state: Mutex::new(BackendState::Running),
            log: Mutex::new(VecDeque::new()),
        }
    }

    fn remember(&self, line: String) {
        let mut log = self.log.lock().unwrap();
        if log.len() >= LOG_LINES {
            log.pop_front();
        }
        log.push_back(line);
    }

    fn stop(&self) {
        if let Some(child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

fn start_backend(app: &AppHandle) {
    let backend = app.state::<Backend>();
    if !backend.managed {
        return;
    }
    let command = match app.shell().sidecar("privia-backend") {
        Ok(command) => command,
        Err(error) => {
            *backend.state.lock().unwrap() = BackendState::Failed {
                message: format!("The bundled backend is missing: {error}"),
            };
            return;
        }
    };
    let spawned = command
        .args(["--host", "127.0.0.1", "--port", &backend.port.to_string()])
        .env("PRIVIA_API_TOKEN", &backend.token)
        .env("PRIVIA_EXIT_ON_STDIN_EOF", "1")
        .env("APP_ENV", "production")
        .spawn();
    let (mut events, child) = match spawned {
        Ok(pair) => pair,
        Err(error) => {
            *backend.state.lock().unwrap() = BackendState::Failed {
                message: format!("The backend could not be started: {error}"),
            };
            return;
        }
    };
    *backend.child.lock().unwrap() = Some(child);
    *backend.state.lock().unwrap() = BackendState::Running;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            let backend = handle.state::<Backend>();
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines().filter(|l| !l.trim().is_empty()) {
                        backend.remember(line.to_string());
                    }
                }
                CommandEvent::Error(message) => backend.remember(message),
                CommandEvent::Terminated(payload) => {
                    *backend.state.lock().unwrap() = BackendState::Exited { code: payload.code };
                    backend.child.lock().unwrap().take();
                }
                _ => {}
            }
        }
    });
}

#[tauri::command]
fn app_info(backend: State<'_, Backend>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        api_base: backend.api_base.clone(),
        token: backend.token.clone(),
        platform: std::env::consts::OS.to_string(),
        managed_backend: backend.managed,
    }
}

#[tauri::command]
fn backend_status(backend: State<'_, Backend>) -> BackendStatus {
    BackendStatus {
        state: backend.state.lock().unwrap().clone(),
        log_tail: backend.log.lock().unwrap().iter().cloned().collect(),
    }
}

#[tauri::command]
fn restart_backend(app: AppHandle) {
    app.state::<Backend>().stop();
    start_backend(&app);
}

/// Open the OS folder picker and return the chosen path.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Choose a folder PRIVIA may read")
        .blocking_pick_folder();
    match picked {
        None => Ok(None),
        Some(path) => path
            .into_path()
            .map(|p| Some(p.to_string_lossy().to_string()))
            .map_err(|e| e.to_string()),
    }
}

/// Open a web link in the user's default browser. Only http(s) is accepted, so
/// a reply cannot make PRIVIA launch `file:`, `javascript:` or app URL schemes.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let lowered = url.trim().to_ascii_lowercase();
    if !(lowered.starts_with("https://") || lowered.starts_with("http://")) {
        return Err("Only web links can be opened.".into());
    }
    tauri_plugin_opener::open_url(url.trim(), None::<&str>).map_err(|e| e.to_string())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Backend::new())
        .invoke_handler(tauri::generate_handler![
            app_info,
            backend_status,
            restart_backend,
            pick_folder,
            open_external
        ])
        .setup(|app| {
            start_backend(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("PRIVIA failed to start");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            handle.state::<Backend>().stop();
        }
    });
}
