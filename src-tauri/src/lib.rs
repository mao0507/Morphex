use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
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
      std::fs::create_dir_all(&data_dir)?;

      let main_js = resource_dir.join("resources/backend/dist/main.js");
      let (_rx, child) = app
        .shell()
        .sidecar("backend")?
        .args([main_js.to_string_lossy().to_string()])
        .env("PORT", "3000")
        .current_dir(data_dir)
        .spawn()
        .expect("failed to spawn backend sidecar");

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
