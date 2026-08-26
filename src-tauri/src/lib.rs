use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

const BACKEND_PORT: &str = "47823";

struct BackendProcess(Mutex<Option<CommandChild>>);

// 啟動時背景檢查一次更新：找到就跳原生對話框問使用者要不要下載，同意才下載安裝，
// 裝完直接重啟套用。跑在背景 task 裡（而非 setup() 同步流程），這樣網路慢或
// GitHub 打不到時，不會卡住主視窗、也不影響 backend sidecar 已經正常啟動
fn spawn_update_check(app: tauri::AppHandle) {
  tauri::async_runtime::spawn(async move {
    let update = match app.updater() {
      Ok(updater) => updater.check().await,
      Err(err) => {
        log::warn!("更新檢查初始化失敗：{err}");
        return;
      }
    };

    let update = match update {
      Ok(Some(update)) => update,
      Ok(None) => return,
      Err(err) => {
        log::warn!("檢查更新失敗：{err}");
        return;
      }
    };

    let version = update.version.clone();
    let should_update = app
      .dialog()
      .message(format!(
        "發現新版本 {version}，是否下載並安裝？\n安裝完成後會自動重新啟動。"
      ))
      .title("Morphex 有可用更新")
      .buttons(MessageDialogButtons::YesNo)
      .blocking_show();

    if !should_update {
      return;
    }

    let install_result = update
      .download_and_install(|_chunk_len, _total_len| {}, || {})
      .await;

    match install_result {
      Ok(()) => app.restart(),
      Err(err) => {
        log::error!("更新下載/安裝失敗：{err}");
        app
          .dialog()
          .message(format!("更新失敗，請稍後再試或手動下載：\n{err}"))
          .kind(MessageDialogKind::Error)
          .title("Morphex 更新失敗")
          .blocking_show();
      }
    }
  });
}

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
    .plugin(tauri_plugin_updater::Builder::new().build())
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

      spawn_update_check(app.handle().clone());

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
