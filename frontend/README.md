# Morphex 前端

Vue 3 + Vite 寫的單頁上傳/轉檔介面。無路由、無狀態管理套件，單一元件 `src/App.vue`。

## 安裝

```bash
npm install
```

## 啟動

```bash
npm run dev      # 開發模式，預設 http://localhost:5173
npm run build    # 建置產出至 dist/
npm run preview  # 預覽建置結果
```

## 環境變數

| 變數 | 說明 | 預設值 |
|---|---|---|
| `VITE_API_BASE_URL` | 後端 API 位址 | `http://localhost:3000` |

啟動前後端服務時，請確認後端已開啟 CORS（已預設開放）。
