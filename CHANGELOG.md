# Changelog

## [0.4.3](https://github.com/mao0507/Morphex/compare/morphex-v0.4.2...morphex-v0.4.3) (2026-09-01)


### Bug Fixes

* **backend:** 上傳暫存資料夾加入孤兒檔案清除 ([d220861](https://github.com/mao0507/Morphex/commit/d2208612c4e01510a8a38dbf18b6ea2e59f59fd9))
* **backend:** 下載串流加上錯誤處理避免程序崩潰 ([93aa96c](https://github.com/mao0507/Morphex/commit/93aa96cbfee76a3616b748a5e5b471b1afdd1d9a))
* **backend:** 修正進度解析取到過舊時間戳的問題 ([d958442](https://github.com/mao0507/Morphex/commit/d9584426cd43ed22115db9c7aea18e2d182e1a66))
* **backend:** 裁切結束時間早於開始時間時回傳錯誤 ([9c57afa](https://github.com/mao0507/Morphex/commit/9c57afa56a99ee31266a6ddf15f2905d04e670c1))
* **frontend:** 上傳過濾補上副檔名後備判斷 ([0c9617d](https://github.com/mao0507/Morphex/commit/0c9617d3235027b7a1800b7f4ef7aebc84ac398b))
* **frontend:** 補上圖片轉檔失敗的錯誤訊息與翻譯 ([f5d72da](https://github.com/mao0507/Morphex/commit/f5d72da95f39940ecc0a494fdccd5f7831b8c2d4))

## [0.4.2](https://github.com/mao0507/Morphex/compare/morphex-v0.4.1...morphex-v0.4.2) (2026-08-31)


### Bug Fixes

* 下載連結失效時顯示錯誤畫面而非導航至空白頁 ([076a3c1](https://github.com/mao0507/Morphex/commit/076a3c1095579c379e6867eedb1e5647c41d24a6))

## [0.4.1](https://github.com/mao0507/Morphex/compare/morphex-v0.4.0...morphex-v0.4.1) (2026-08-31)


### Bug Fixes

* **frontend:** 格式清單載入失敗時顯示提示訊息 ([7815cc0](https://github.com/mao0507/Morphex/commit/7815cc0410344d82440081262de095f59501b20e))

## [0.4.0](https://github.com/mao0507/Morphex/compare/morphex-v0.3.2...morphex-v0.4.0) (2026-08-28)


### Features

* **desktop:** 桌面版原生對話框依 OS 語言顯示 ([cbc0973](https://github.com/mao0507/Morphex/commit/cbc097337e75d913d6a30728a851d82fbf655e3d))
* **frontend:** 前端 UI 字串全面 i18n 化 ([601992c](https://github.com/mao0507/Morphex/commit/601992c100ede9c0c5592833bc29d5c1af604730))

## [0.3.2](https://github.com/mao0507/Morphex/compare/morphex-v0.3.1...morphex-v0.3.2) (2026-08-28)


### Miscellaneous Chores

* 強制觸發下一版 release ([b63a8a1](https://github.com/mao0507/Morphex/commit/b63a8a128e19c44e0fa9326d2163a40b2d305257))

## [0.3.1](https://github.com/mao0507/Morphex/compare/morphex-v0.3.0...morphex-v0.3.1) (2026-08-26)


### Bug Fixes

* 更新版重新產生 updater 簽章 key ([a7d8b07](https://github.com/mao0507/Morphex/commit/a7d8b079e2fd94e04afb14ad62145e31cb47cf97))

## [0.3.0](https://github.com/mao0507/Morphex/compare/morphex-v0.2.2...morphex-v0.3.0) (2026-08-26)


### Features

* 圖片新增壓縮模式，不換格式只縮小檔案 ([c5d1426](https://github.com/mao0507/Morphex/commit/c5d14263a55a03a493b83351005830ef737faa0f))
* 桌面版新增自動檢查更新功能 ([b79e32d](https://github.com/mao0507/Morphex/commit/b79e32da4e611bcd8a69d04abbd1b647a7701823))

## [0.2.2](https://github.com/mao0507/Morphex/compare/morphex-v0.2.1...morphex-v0.2.2) (2026-08-26)


### Bug Fixes

* 用官方 registry 重建全部 lockfile 修正 optional deps 不一致 ([301d527](https://github.com/mao0507/Morphex/commit/301d52771c9575ea06e21d460c5ef5f2bc382247))

## [0.2.1](https://github.com/mao0507/Morphex/compare/morphex-v0.2.0...morphex-v0.2.1) (2026-08-26)


### Bug Fixes

* 重建 backend lockfile 修正 sharp optional deps 版本不同步 ([2263dc3](https://github.com/mao0507/Morphex/commit/2263dc3d4bef9320677ec1b7699cd87bc58169b0))

## [0.2.0](https://github.com/mao0507/Morphex/compare/morphex-v0.1.0...morphex-v0.2.0) (2026-08-26)


### Features

* 使用 npm 套件管理 ffmpeg/ffprobe 二進位路徑 ([dd13504](https://github.com/mao0507/Morphex/commit/dd135044d59418b71204ff4832943e2c96e5c055))
* 新增 NestJS 後端完整實作 ([8620b80](https://github.com/mao0507/Morphex/commit/8620b80022d3f4f7b965f101f09984974f40eaae))
* 新增 Tauri 桌面應用包裝 ([c88d47d](https://github.com/mao0507/Morphex/commit/c88d47d0f456c349535e023c4b7aeb90c30a3e42))
* 新增 Vue 3 前端專案初始化設定 ([57be0ea](https://github.com/mao0507/Morphex/commit/57be0ea874f1df59b5abe5c9ea7df5a9a4a0dec6))
* 新增圖片轉檔功能 ([65259a3](https://github.com/mao0507/Morphex/commit/65259a304e5edc1dc042740b61d09312712f1c72))
* 新增進階轉換選項與影片縮圖預覽 ([681500f](https://github.com/mao0507/Morphex/commit/681500f6b360ffb381fe2522a78c9b40fadfaa7f))
* 桌面版強化與 Windows/macOS 自動發版 ([1ff7e5e](https://github.com/mao0507/Morphex/commit/1ff7e5e034a8af01e5c223fee2ecb58cff7b5be6))
* 異步任務佇列、進度回報與進階轉換選項 ([61d030e](https://github.com/mao0507/Morphex/commit/61d030edad9dc8539258a08c2bd1070f9ba82f80))
