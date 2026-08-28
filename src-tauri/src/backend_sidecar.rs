use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

use crate::i18n;

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
  let lang = i18n::detect();

  let resource_dir = match app.path().resource_dir() {
    Ok(dir) => dir,
    Err(err) => return fail(app, lang, i18n::resource_dir_error(lang, err)),
  };
  let data_dir = match app.path().app_data_dir() {
    Ok(dir) => dir,
    Err(err) => return fail(app, lang, i18n::data_dir_error(lang, err)),
  };

  // Prior run's leftovers are meaningless (no download link survives a
  // restart), and the backend's own 30-min sweep never runs if the app
  // was killed/crashed instead of exiting cleanly. Start every launch clean.
  let _ = std::fs::remove_dir_all(data_dir.join("tmp"));
  if let Err(err) = std::fs::create_dir_all(&data_dir) {
    return fail(app, lang, i18n::create_data_dir_error(lang, err));
  }

  let main_js = resource_dir.join("resources/backend/dist/main.js");
  let sidecar_command = match app.shell().sidecar("backend") {
    Ok(cmd) => cmd,
    Err(err) => return fail(app, lang, i18n::sidecar_missing_error(lang, err)),
  };

  let spawn_result = sidecar_command
    .args([main_js.to_string_lossy().to_string()])
    .env("PORT", BACKEND_PORT)
    .current_dir(data_dir)
    .spawn();

  let child = match spawn_result {
    Ok((_rx, child)) => child,
    Err(err) => return fail(app, lang, i18n::sidecar_spawn_error(lang, err)),
  };

  *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
}

fn fail(app: &tauri::App, lang: i18n::Lang, message: String) {
  let handle = app.handle().clone();
  app
    .dialog()
    .message(message)
    .kind(MessageDialogKind::Error)
    .title(i18n::launch_failed_title(lang))
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
