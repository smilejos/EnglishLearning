# 客廳十五詞：本機網頁預覽

日期：2026-10-09。這是獨立的本機效果與互動預覽，尚未匯入情境資料庫或部署正式網站。

## 開啟

```bash
npm run scenario:preview:prepare
npm run dev -w @el/web-learner -- --host 127.0.0.1 --port 5174 --strictPort
```

開啟 <http://127.0.0.1:5174/scenario-preview.html>。只綁定本機位址；同一電腦的瀏覽器可開啟。預覽獨立 HTML entry，不掛載原 App、不讀 `/me` 或字庫 API，不連資料庫、不啟動 worker，也不呼叫生成服務。

準備指令使用已確認的 [客廳套件](packages/living-room-15-v1/scenario.json) 與來源字庫，先預檢再保存 `web-learner/src/scenarioPreviewData.json`。頁面包含 15 個目標詞及故事涉及的 41 個詞條。其音檔從本機 manifest 核對 GUID、類型、文字 hash、路徑及大小，將有效檔案複製到 `data/scenario-preview/living-room/audio/`；不生成新音檔，也不把失效 metadata 當成可播放素材。

本機音檔資料夾受既有 `.gitignore` 排除，未隨 Git 提交。在沒有音檔素材的環境重跑準備指令，頁面仍可讀文字，朗讀會顯示待準備；不應拿過期產物宣稱有聲音。開發頁經 Vite 載入本機素材；目前預設正式 build 只包含原 `index.html`，不包含這個額外 HTML entry。正式首頁的情境入口仍停用。

## 可確認的操作

- 桌面點圖片中的英文標籤，開啟浮在圖片上方的單字 Modal，查看中文釋義、本情境詞義、英文解釋、中英例句與可用音檔。圖下不再排列單字按鈕，也沒有常駐單字卡。
- 「放大圖片」旁的「故事與旁白」按鈕才開啟故事 Modal；平時不顯示故事段落。故事的所有字形可點選，reads／sleeps／Books 連回 read／sleep／book。查詞時切換同一個 Modal，不疊兩層，並可「回到故事」；繁中翻譯預設收合，返回故事保留展開狀態。
- 字庫解釋與例句保留原有內容，先顯示第一筆，其餘可展開。不虛構文章來源，不因點字或播放建立收藏。
- 開卡不自動朗讀；手動播放單字、解釋或例句，任一時間只播一個音源。關閉 Modal、回到故事、換詞或離頁停止上一音源，播放失敗提供重試。
- Modal 支援關閉按鈕、Escape 與點擊背景；內部內容獨立捲動，背景頁面鎖住，關閉後回到原入口焦點與圖片位置。
- 手機先放大圖片，再點圖上標籤；也能從故事查字。放大區域內可以捲動，不增加整頁水平溢出。小圖狀態不顯示點選位置開關。

## 已知限制

- 原圖英文已畫在圖片內；此頁不提供隱藏答案的回想模式，避免假裝把文字隱藏。正式無文字底圖仍待準備。
- 本頁點選位置是這張參考圖的臨時標籤區域，不寫回正式套件的 `interaction`，也不是物件輪廓或作答判定資料。
- 英文故事旁白尚未生成。curtain、shelf、pillow 三個 advance 詞尚無音檔。
- 十二個 basic 目標詞的 93 段音檔已核對並沿用；另外提供 26 段支援詞單字音檔，共 119 段。支援詞的解釋及例句音檔未複製，顯示待準備。
- 套件預檢仍是 `valid: true`／`publishReady: false`。網頁能打開不代表完成正式匯入、發布或旁白驗收。

## 驗證入口

```bash
npm run scenario:preview:test
npm test
npm run typecheck
```

新增 Node 測試使用暫存假素材，不連 DB；前端測試使用假 Audio。全專案測試沿用獨立 `_test` 資料庫，實際執行結果以交付回報為準。
