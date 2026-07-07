所有的對談都使用繁體中文

## Git commit 規則
- 每次完成一個任務的最後異動後，先詢問使用者「這樣是否滿意？」。
- 使用者表示滿意後，自動執行 `git commit` 將該次異動提交（不需再次徵求提交許可）。
- 使用者表示不滿意時，依回饋修正，修正後再次詢問，滿意才提交。
- commit 訊息使用繁體中文，簡述本次異動內容。

## 測試與 LLM 費用規則
- **預設測試套件（`npm test`）絕不呼叫真實 LLM／TTS（Gemini）API**。所有 LLM／TTS 互動一律以 mock 取代（api/worker 用注入的假 client；LLM 單元測試 mock `fetch`）。
- **LLM 相關的真實 API 測試只在明確需要時才手動執行**，避免產生不必要的費用；不得掛在預設 `npm test` 或 CI 例行流程。若新增此類測試，須以環境變數旗標明確 opt-in 並在說明中標註會產生費用。
- **測試範疇要明確**：不需要 LLM 的邏輯就用固定輸入／mock 驗證，不重新產生內容。
- 整合測試一律跑在獨立測試庫（`docker-compose.test.yml`，5433/`english_learning_test`，tmpfs 即用即棄），不碰正式機資料。

## 示範資料還原（免 LLM）
- 重置資料庫後，**用預錄 fixtures 還原，不要重新 `POST /articles` 讓 worker 再呼叫 Gemini**。
- Fixtures 位於 `fixtures/seed/`：`manifest.json`（文章／分類／標籤／段落＋翻譯）與 `audio/`（預錄音檔）。
- 匯入指令：`npm run seed`（透過 `docker compose --profile seed`，直接寫入 DB 並把音檔複製進 audio volume，狀態直接為 done）。
- 若新增了想長期保留的示範內容，將其翻譯與音檔補進 `fixtures/seed/` 後再提交。