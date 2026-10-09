# 客廳十五詞：本機網頁預覽

日期：2026-10-09。原獨立預覽保留燒字參考圖與已驗收 Modal。正式 App 情境功能另已實作，使用無標籤底圖與獨立 API，在 `_test` 資料庫作本機 QA；尚未寫入正式情境庫、部署或發布。

## 原獨立預覽：5174

```bash
npm run scenario:preview:prepare
npm run dev -w @el/web-learner -- --host 127.0.0.1 --port 5174 --strictPort
```

開啟 <http://127.0.0.1:5174/scenario-preview.html>。只綁定本機位址；同一電腦的瀏覽器可開啟。預覽獨立 HTML entry，不掛載原 App、不讀 `/me` 或字庫 API，不連資料庫、不啟動 worker，也不呼叫生成服務。

準備指令使用已確認的 [客廳套件](packages/living-room-15-v1/scenario.json) 與來源字庫，先預檢再保存 `web-learner/src/scenarioPreviewData.json`。頁面包含 15 個目標詞及故事涉及的 41 個詞條。其音檔從本機 manifest 核對 GUID、類型、文字 hash、路徑及大小，將有效檔案複製到 `data/scenario-preview/living-room/audio/`；不生成新音檔，也不把失效 metadata 當成可播放素材。

本機音檔資料夾受既有 `.gitignore` 排除，未隨 Git 提交。在沒有音檔素材的環境重跑準備指令，頁面仍可讀文字，朗讀會顯示待準備；不應拿過期產物宣稱有聲音。開發頁經 Vite 載入本機素材；目前預設正式 build 只包含原 `index.html`，不包含這個額外 HTML entry。正式 App 的首頁情境入口已接 `#/scenarios`，不連到本頁。

## 正式 App 本機 QA：5181／API 5180

QA 環境須使用獨立 `_test` 資料庫、測試媒體目錄及不注入真實生成 client 的 API；只在測試庫匯入及發布客廳 revision。Vite 的 `VITE_API_PROXY=http://127.0.0.1:5180`，網址為 <http://127.0.0.1:5181/#/scenarios/living-room>，清單為 `#/scenarios`。API 必須注入情境 image／audio roots；原 `api/src/preview.ts` 尚未提供情境媒體依賴，不能直接當作此 QA 入口。此環境與原 5174 預覽分開，不啟動正式服務或 worker。

正式頁使用套件的無標籤底圖、十五組比例座標與受發布權限保護的旁白；提供看圖學習／回想、放大圖、單字／故事 Modal。回想揭曉前不顯示標籤、故事、翻譯及單字答案入口。Serena 故事已生成 31.896 秒，待使用者試聽；座標重疊與手機操作已通過本輪 QA。advance 27 段已生成，正式字庫 metadata 尚未匯入。

本輪臨時 QA 入口為 `data/scenario-generation/living-room-v1/preview-server.ts`（Git 忽略，僅在此機存在）：讀取 `shared/testing` 的 `_test` 連線，載入 41 詞條、146 段可用字庫音檔與完整故事，將客廳發布於測試庫，再啟動 5180。它會清空相關測試表，僅供此輪驗收；不得改用正式 `DATABASE_URL`。API 及 Vite 已啟動，保留供使用者試聽；完成審閱後停掉兩個行程，再 `npm run test:db:down`。此臨時檔不作為正式部署入口。

本輪已實測桌面及 390×844 手機，未見頁面水平溢出；圖上字卡、新補 advance 音訊、旁白播放／語速／查詞暫停與續播、Modal 鍵盤焦點／Escape／返回，以及回想揭曉前隱藏答案均正常。截圖保存於 `.impeccable/review/scenario-formal/`。

## 原獨立預覽可確認的操作

- 桌面點圖片中的英文標籤，開啟浮在圖片上方的單字 Modal，查看中文釋義、本情境詞義、英文解釋、中英例句與可用音檔。圖下不再排列單字按鈕，也沒有常駐單字卡。
- 「放大圖片」旁的「故事與旁白」按鈕才開啟故事 Modal；平時不顯示故事段落。故事的所有字形可點選，reads／sleeps／Books 連回 read／sleep／book。查詞時切換同一個 Modal，不疊兩層，並可「回到故事」；繁中翻譯預設收合，返回故事保留展開狀態。
- 字庫解釋與例句保留原有內容，先顯示第一筆，其餘可展開。不虛構文章來源，不因點字或播放建立收藏。
- 開卡不自動朗讀；手動播放單字、解釋或例句，任一時間只播一個音源。關閉 Modal、回到故事、換詞或離頁停止上一音源，播放失敗提供重試。
- Modal 支援關閉按鈕、Escape 與點擊背景；內部內容獨立捲動，背景頁面鎖住，關閉後回到原入口焦點與圖片位置。
- 手機先放大圖片，再點圖上標籤；也能從故事查字。放大區域內可以捲動，不增加整頁水平溢出。小圖狀態不顯示點選位置開關。

## 原獨立預覽的限制

- 原圖英文已畫在圖片內；此頁不提供隱藏答案的回想模式，避免假裝把文字隱藏。正式無標籤底圖已接正式 App 的情境功能，尚未替換本頁。
- 本頁點選位置是這張參考圖的臨時標籤區域，不寫回正式套件的 `interaction`，也不是物件輪廓或作答判定資料。
- 原頁沒有接入新生成的旁白及 curtain／shelf／pillow 補音；素材已生成不代表本頁快照已更新。
- 十二個 basic 目標詞的 93 段音檔已核對並沿用；另外提供 26 段支援詞單字音檔，共 119 段。支援詞的解釋及例句音檔未複製，顯示待準備。
- 本機完整素材的套件預檢已為 `valid: true`／`publishReady: true`；此結果不代表原頁快照已更新，也不代表完成正式匯入、發布或旁白試聽。

## 驗證入口

```bash
npm run scenario:preview:test
npm run scenario:audio:test
npm test
npm run typecheck
```

新增 Node 測試使用暫存假素材，不連 DB；前端測試使用假 Audio。全專案測試沿用獨立 `_test` 資料庫，實際執行結果以交付回報為準。
