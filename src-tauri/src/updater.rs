use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

// 背景檢查一次更新：找到就跳原生對話框問使用者要不要下載，同意才下載安裝，
// 裝完直接重啟套用。跑在背景 task 裡（而非呼叫端的同步流程），這樣網路慢或
// GitHub 打不到時，不會卡住主視窗、也不影響呼叫端其他啟動步驟
pub fn check_for_updates(app: tauri::AppHandle) {
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
