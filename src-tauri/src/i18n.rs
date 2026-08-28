// 原生對話框（啟動失敗、更新提示）用的極簡語系判斷。跟前端 vue-i18n 完全
// 獨立——這裡讀 OS 語言，不讀網頁裡選的語言，因為啟動失敗那個對話框可能在
// webview 都還沒起來前就跳出來，本來就沒有前端語言可以問。
#[derive(Clone, Copy)]
pub enum Lang {
  ZhTw,
  En,
  Ja,
}

pub fn detect() -> Lang {
  match sys_locale::get_locale() {
    Some(locale) => {
      let locale = locale.to_lowercase();
      if locale.starts_with("ja") {
        Lang::Ja
      } else if locale.starts_with("en") {
        Lang::En
      } else {
        Lang::ZhTw
      }
    }
    None => Lang::ZhTw,
  }
}

pub fn launch_failed_title(lang: Lang) -> &'static str {
  match lang {
    Lang::ZhTw => "Morphex 啟動失敗",
    Lang::En => "Morphex Failed to Start",
    Lang::Ja => "Morphex の起動に失敗しました",
  }
}

pub fn resource_dir_error(lang: Lang, err: impl std::fmt::Display) -> String {
  match lang {
    Lang::ZhTw => format!("無法取得應用程式資源路徑：\n{err}"),
    Lang::En => format!("Could not resolve the app resource path:\n{err}"),
    Lang::Ja => format!("アプリのリソースパスを取得できませんでした：\n{err}"),
  }
}

pub fn data_dir_error(lang: Lang, err: impl std::fmt::Display) -> String {
  match lang {
    Lang::ZhTw => format!("無法取得應用程式資料路徑：\n{err}"),
    Lang::En => format!("Could not resolve the app data path:\n{err}"),
    Lang::Ja => format!("アプリのデータパスを取得できませんでした：\n{err}"),
  }
}

pub fn create_data_dir_error(lang: Lang, err: impl std::fmt::Display) -> String {
  match lang {
    Lang::ZhTw => format!("無法建立應用程式資料夾：\n{err}"),
    Lang::En => format!("Could not create the app data folder:\n{err}"),
    Lang::Ja => format!("アプリのデータフォルダを作成できませんでした：\n{err}"),
  }
}

pub fn sidecar_missing_error(lang: Lang, err: impl std::fmt::Display) -> String {
  match lang {
    Lang::ZhTw => format!("找不到轉檔服務執行檔：\n{err}"),
    Lang::En => format!("Could not find the conversion service executable:\n{err}"),
    Lang::Ja => format!("変換サービスの実行ファイルが見つかりません：\n{err}"),
  }
}

pub fn sidecar_spawn_error(lang: Lang, err: impl std::fmt::Display) -> String {
  match lang {
    Lang::ZhTw => format!("轉檔服務啟動失敗, 無法繼續執行：\n{err}"),
    Lang::En => format!("The conversion service failed to start, cannot continue:\n{err}"),
    Lang::Ja => format!("変換サービスの起動に失敗したため、続行できません：\n{err}"),
  }
}

pub fn update_available_title(lang: Lang) -> &'static str {
  match lang {
    Lang::ZhTw => "Morphex 有可用更新",
    Lang::En => "Morphex Update Available",
    Lang::Ja => "Morphex のアップデートがあります",
  }
}

pub fn update_available_message(lang: Lang, version: impl std::fmt::Display) -> String {
  match lang {
    Lang::ZhTw => format!("發現新版本 {version}，是否下載並安裝？\n安裝完成後會自動重新啟動。"),
    Lang::En => format!(
      "Version {version} is available. Download and install it?\nThe app will restart automatically once installed."
    ),
    Lang::Ja => format!(
      "新しいバージョン {version} が見つかりました。ダウンロードしてインストールしますか？\nインストール後は自動的に再起動します。"
    ),
  }
}

pub fn update_failed_title(lang: Lang) -> &'static str {
  match lang {
    Lang::ZhTw => "Morphex 更新失敗",
    Lang::En => "Morphex Update Failed",
    Lang::Ja => "Morphex のアップデートに失敗しました",
  }
}

pub fn update_failed_message(lang: Lang, err: impl std::fmt::Display) -> String {
  match lang {
    Lang::ZhTw => format!("更新失敗，請稍後再試或手動下載：\n{err}"),
    Lang::En => format!("Update failed. Please try again later or download it manually:\n{err}"),
    Lang::Ja => format!("アップデートに失敗しました。しばらくしてから再試行するか、手動でダウンロードしてください：\n{err}"),
  }
}
