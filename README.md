# 🇯🇵 日本代購離線清單 PWA

專為日本現場採買（藥妝店、地下街、無訊號環境）打造的**純本機、離線優先（Offline-First）**漸進式網頁應用程式（PWA）。採用原生 HTML5 / CSS3 / ES6+ JavaScript 開發，零外部框架與後端依賴。

> 🌐 **線上使用／手機安裝網址**：https://hank92312.github.io/jp-shopping-pwa/  
> 📄 **完整技術與功能規格**：請參閱 [APP.md](./APP.md)

---

## ✨ 核心功能

- **100% 離線可用**：透過 Service Worker 雙快取策略（商品圖片 `Cache-First`、主程式與清單 `Network-First`）與本機 IndexedDB，飛航模式下仍可秒開操作。
- **單手操作優化**：狀態篩選（未購買／全部／已購買）、店家橫向快篩、即時關鍵字搜尋，與右側 `48×48px` 大勾選按鈕，單手即可快速紀錄。
- **大圖比對與日文尋貨字卡**：點擊商品縮圖可全螢幕雙指縮放比對，底部固定高對比日文詢問卡「**すみません、この商品はありますか？**」（自動隱藏委託人與私人備註）。
- **現場拍照與自動壓縮**：支援「現場拍照」與「相簿選圖」，前端自動等比縮放至長邊 `≤ 800px` 並壓縮為 `< 200KB` WebP 存入本機。
- **行前無損合併更新**：更新 `data/items.json`（並遞增 `version`）時，依 `id` 自動無損合併，絕不覆蓋現場已勾選、實付價格或備註紀錄。
- **一鍵結帳與請款**：依自訂日圓匯率與單品無條件進位試算台幣，自動依「委託人」分組統計，支援複製 **LINE 請款純文字明細** 與匯出 **UTF-8 BOM CSV（Excel 不亂碼）**。

---

## 📱 手機安裝與出國前準備

1. 在手機（Android Chrome）開啟上方 GitHub Pages 網址。
2. 點擊瀏覽器選單 **「安裝應用程式」**（或「加到主畫面」），即可作為獨立視窗 App 使用。
3. **出國前（在台灣連 Wi-Fi 時）**：點擊頂部 **「離線 X/Y」** 按鈕（或至「備份與匯入」→「預載離線包」），待顯示 **「✅ 離線已就緒」** 後即可關閉網路／開啟飛航模式測試。

---

## ✏️ 自訂自己的代購清單

1. 將商品圖片轉為輕量 `.webp`（建議寬度 `≤ 600px`）放入 `assets/images/`。
2. 編輯 `data/items.json`，填寫商品 `id`、`name`、`image`、`targetPrice`、`targetQty`、`stores`、`requester`、`note`，並更新頂部的 `"version"` 版本號。
3. 推送到 GitHub 後，手機連網打開 App（或在「備份與匯入」點擊 **「🔄 檢查清單更新」**）即可無損同步新項目。

> 💡 也可直接在手機 App 內編輯或新增後，至「備份與匯入」匯出完整 JSON 備份或靜態 `items.json` 範本。

---

## 📂 專案結構

```text
├── index.html          # 主結構（代購清單、結帳統計、備份與匯入）
├── manifest.json       # PWA 安裝設定檔
├── sw.js               # Service Worker（雙快取與離線預載）
├── css/style.css       # 響應式樣式（含深淺色主題）
├── js/
│   ├── app.js          # 主程式控制、篩選、Lightbox 手勢與 UI
│   ├── db.js           # IndexedDB 封裝與無損合併引擎
│   ├── image-util.js   # Canvas 等比縮放與 WebP 壓縮
│   └── export.js       # 委託人結算、LINE 明細與 CSV 匯出
├── data/items.json     # 靜態初始代購清單
└── assets/
    ├── icons/          # PWA 圖示 (svg / 192px / 512px)
    └── images/         # 預載商品圖片 (.webp)
```
