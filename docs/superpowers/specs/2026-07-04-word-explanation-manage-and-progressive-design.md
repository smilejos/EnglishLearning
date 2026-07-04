# 單字解釋：前台彈窗調整、漸進式解釋、後台管理

日期：2026-07-04

## 背景與目標

前台點擊單字會開啟解釋彈窗（見 `web-learner/src/App.tsx` 的 `WordPopup` /
`ExplanationCard`）。目前彈窗的音檔鈕全部集中在卡片底部、每張卡重複顯示「單字英／
單字中／解釋英／解釋中／例句英／例句中」六顆膠囊；「用本篇重新解釋」會等 LLM 文字
＋六段 TTS 全部完成才一次回傳，等待偏長。後台（`web-admin`）目前完全沒有單字解釋的
管理入口，也沒有刪除解釋／單字的 API。

本次要達成：

1. 前台彈窗音檔鈕改為貼在各句之後、純圖示播放鈕；移除「單字中」鈕。
2. 前台彈窗可跳轉到後台單字管理頁。
3. 重新解釋改為「文字先出、音檔後補」的漸進式體驗。
4. 後台可從「全站單字分頁」與「文章詳情」兩個入口管理單字解釋，能刪除單一解釋
   或整個單字。

## 1. 前台單字彈窗（`web-learner`）

### 音檔鈕貼到各句之後（`ExplanationCard`）

- 拆掉底部的六顆膠囊列。
- 「單字英」（`word.enAudioPath`，英文單字發音）移到**彈窗標題** `thick` 旁，
  每個字只有一顆（多張解釋卡共用）。純圖示播放鈕。
- 每張解釋卡的各句句末各放一顆**純圖示播放鈕**（不再顯示「解釋英／解釋中／例句英
  ／例句中」文字標籤）：
  - 解釋（英）句末 → `enExplanationAudioPath`
  - 解釋（中）句末 → `zhExplanationAudioPath`
  - 例句（英）句末 → `enExampleAudioPath`
  - 例句（中）句末 → `zhExampleAudioPath`
- **移除「單字中」鈕**（原 `zhTranslationAudioPath` 那顆）。中文字（例：「厚」）仍
  照顯示，只是沒有播放鈕。
- 音檔不存在或尚在產生中時，播放鈕維持 `disabled`，以 tooltip 區分「產生中…」與
  「尚無語音」。`AudioChip` 改為圖示按鈕型態（保留既有 idle/loading/playing/error
  狀態與 `audioBus` 互斥播放邏輯）。

### 前台 → 後台跳轉

- 彈窗標題區加一個小的「⚙ 後台管理」連結，深連結到後台單字頁並帶入該字：
  `${ADMIN_URL}/#/w/<normalizedWord>`。
- 新增 `VITE_ADMIN_URL` build 參數（對稱於現有 admin 端的 `VITE_LEARNER_URL`），
  於 `docker-compose.yml` 的 `web-learner` service 以 `ADMIN_URL_PUBLIC` 帶入，
  預設 `http://localhost:8081`（admin 對外埠 `WEB_ADMIN_PORT` 預設 8081）。
- 後台位於 Cloudflare Access 之後，非管理者點擊會被 Access 擋下；家用情境可接受，
  不在前台實作額外權限判斷。

## 2. 漸進式解釋（文字先出、音檔後補）

### 後端 `POST /lookups`

快取命中維持原樣（直接回既有解釋）。快取未命中改為兩階段：

1. `explainWord` 產生文字 → 寫入解釋列（六個音檔欄位先為 `null`）→ **回 201 文字**。
   並發首查同 `(word, article)` 造成的 `23505` 仍照現行處理（回既有列）。
2. 回應送出後，以 in-process fire-and-forget 背景工作補產 TTS：
   - 單字英文發音（若 `words.en_audio_path` 仍為 null）→ `setWordEnAudioPath`
   - 五段解釋／例句音檔 → `updateExplanationAudioPaths`
   - 逐項盡力而為，單項失敗記 log；不影響已回傳的文字。
- 用量韁繩（rate limiter）維持在「快取未命中、即將呼叫 LLM」時檢查。

### 前端

- `reexplain` 回來後先 `load()` 顯示文字（此時音檔欄位多為 null，播放鈕停用並顯示
  「產生中…」）。
- 接著**有上限地輪詢**：每 **5 秒**重新 `load()` 一次，最多 **4 次**（約 20 秒上限）。
  每次刷新後，已補上路徑的音檔鈕會自動由停用轉為可點。
- 到達次數上限即停止輪詢；仍缺的音檔維持停用（可日後由後台 backfill 補齊）。
- 若某次輪詢發現該解釋的音檔皆已補齊，可提前結束輪詢。

## 3. 後台單字管理（`web-admin`）

### 新增 API（皆 admin-only，`requireAdmin`）

- `GET /words?q=<substring>` — 搜尋單字，回
  `{ words: [{ id, normalizedWord, enAudioPath, explanationCount }] }`。
- `GET /articles/:id/explanations` — 該文章產生過的解釋（含內容欄位與音檔狀態），
  供「文章內清單」使用。
- `DELETE /explanations/:id` — 刪除單一解釋（某文章、某上下文的翻譯）。
- `DELETE /words/:id` — 刪除整個單字；`word_explanations.word_id ON DELETE CASCADE`
  會連帶刪掉其所有解釋。

回傳與錯誤：無此資源回 404；非 admin 回 403；成功回 `{ ok: true }`。

### 新增 repo 函式（`shared/src/repo`）

- `words.ts`：`searchWords(db, q, limit)`（含各字解釋數）、`deleteWord(db, id)`。
- `wordExplanations.ts`：`listExplanationsByArticle(db, articleId)`（含內容與音檔
  路徑）、`getExplanationById(db, id)`、`deleteExplanation(db, id)`。

### 音檔清理

- 刪解釋：DB 刪列後，盡力 `unlink` 該解釋依存的相對音檔路徑（最多五個）。
- 刪單字：cascade 刪列後盡力清掉 `words/<id>/` 整包（含英文發音）。
- 檔案刪除失敗只記 log、不阻斷回應（孤兒音檔無害）。清理需要 `audioDir`；若路由
  未注入音檔設定（如部分測試情境）則略過檔案清理，只做 DB 刪除。

### UI

- 頂部導覽新增「單字」分頁（`view === "words"`）→ `WordManager` 元件：
  - 搜尋框 + 單字清單（顯示單字、解釋數、是否有英文發音）。
  - 展開某字 → 列出其各文章解釋（來源文章、內容摘要、音檔狀態），每筆可刪；
    另有「刪除整個單字」。
  - 支援 hash 深連結 `#/w/<word>`：進站帶入搜尋字並自動展開對應單字。
- `ArticleDetail` 新增「本篇單字解釋」區塊：列出該文章產生的解釋、可就地刪除。

## 4. 測試

遵守專案規則：預設 `npm test` 一律不呼叫真實 LLM／TTS，全以 mock 取代；整合測試
跑在獨立測試庫（`docker-compose.test.yml`）。

- repo：`searchWords`、`listExplanationsByArticle`、`deleteExplanation`、`deleteWord`
  （驗證 cascade 連帶刪解釋）。
- 路由：
  - `DELETE /explanations/:id`、`DELETE /words/:id` 的 403（非 admin）／404／正常刪除。
  - `POST /lookups` 兩階段：以 mock explain/tts client 驗證「先回文字（音檔為 null）」
    且背景補音檔後路徑就緒。
- 前台：`AudioChip` 由停用轉可點；輪詢每 5 秒、最多 4 次的停止條件。

## 非目標（YAGNI）

- 不做前台的即時段落翻譯（段落翻譯維持預先產生、點開即顯示）。
- 不引入 worker 佇列處理 lookup 的 TTS；沿用現行 in-process 互動式流程。
- 前台不新增管理者權限判斷（依賴 Cloudflare Access）。
