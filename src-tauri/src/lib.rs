use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const BACKEND_PORT: &str = "47823";

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(BackendProcess(Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let resource_dir = app.path().resource_dir()?;
      let data_dir = app.path().app_data_dir()?;

      // Prior run's leftovers are meaningless (no download link survives a
      // restart), and the backend's own 30-min sweep never runs if the app
      // was killed/crashed instead of exiting cleanly. Start every launch clean.
      let _ = std::fs::remove_dir_all(data_dir.join("tmp"));
      std::fs::create_dir_all(&data_dir)?;

      let main_js = resource_dir.join("resources/backend/dist/main.js");
      let spawn_result = app
        .shell()
        .sidecar("backend")?
        .args([main_js.to_string_lossy().to_string()])
        .env("PORT", BACKEND_PORT)
        .current_dir(data_dir)
        .spawn();

      let child = match spawn_result {
        Ok((_rx, child)) => child,
        Err(err) => {
          let handle = app.handle().clone();
          app
            .dialog()
            .message(format!("轉檔服務啟動失敗, 無法繼續執行：\n{err}"))
            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
            .title("MediaForge 啟動失敗")
            .blocking_show();
          handle.exit(1);
          return Ok(());
        }
      };

      *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let tauri::RunEvent::ExitRequested { .. } = event {
        if let Some(child) = app_handle.state::<BackendProcess>().0.lock().unwrap().take() {
          let _ = child.kill();
        }
      }
    });
}
