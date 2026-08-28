use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const BACKEND_PORT: &str = "47823";

pub struct BackendProcess(Mutex<Option<CommandChild>>);

impl BackendProcess {
  pub fn new() -> Self {
    Self(Mutex::new(None))
  }
}

// 準備乾淨的工作目錄、把 NestJS backend 當 sidecar 開起來，存進 app state 供
// kill() 之後取用。任何一步失敗都跳原生錯誤對話框並直接結束程式——呼叫端
// 不用處理失敗分支，只有「視窗有沒有出現」這一種可觀察結果
pub fn spawn(app: &tauri::App) {
  let resource_dir = match app.path().resource_dir() {
    Ok(dir) => dir,
    Err(err) => return fail(app, format!("無法取得應用程式資源路徑：\n{err}")),
  };
  let data_dir = match app.path().app_data_dir() {
    Ok(dir) => dir,
    Err(err) => return fail(app, format!("無法取得應用程式資料路徑：\n{err}")),
  };

  // Prior run's leftovers are meaningless (no download link survives a
  // restart), and the backend's own 30-min sweep never runs if the app
  // was killed/crashed instead of exiting cleanly. Start every launch clean.
  let _ = std::fs::remove_dir_all(data_dir.join("tmp"));
  if let Err(err) = std::fs::create_dir_all(&data_dir) {
    return fail(app, format!("無法建立應用程式資料夾：\n{err}"));
  }

  let main_js = resource_dir.join("resources/backend/dist/main.js");
  let sidecar_command = match app.shell().sidecar("backend") {
    Ok(cmd) => cmd,
    Err(err) => return fail(app, format!("找不到轉檔服務執行檔：\n{err}")),
  };

  let spawn_result = sidecar_command
    .args([main_js.to_string_lossy().to_string()])
    .env("PORT", BACKEND_PORT)
    .current_dir(data_dir)
    .spawn();

  let child = match spawn_result {
    Ok((_rx, child)) => child,
    Err(err) => return fail(app, format!("轉檔服務啟動失敗, 無法繼續執行：\n{err}")),
  };

  *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
}

fn fail(app: &tauri::App, message: String) {
  let handle = app.handle().clone();
  app
    .dialog()
    .message(message)
    .kind(MessageDialogKind::Error)
    .title("Morphex 啟動失敗")
    .blocking_show();
  handle.exit(1);
}

pub fn kill(app_handle: &tauri::AppHandle) {
  if let Some(child) = app_handle
    .state::<BackendProcess>()
    .0
    .lock()
    .unwrap()
    .take()
  {
    let _ = child.kill();
  }
}
