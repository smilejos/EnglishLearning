# 平台全面評估與改善計畫 — 設計文件

- 日期：2026-07-04
- 狀態：待審查（評估完成，改善項目尚未實作）
- 範圍：系統架構、程式邏輯、版面設計（web-admin / web-learner）、測試與文件
- 前置文件：`design-english-learning-platform-2026-06-29.md`（原始設計）、`plan-english-learning-platform-2026-06-29.md`（原始實作計畫）

---

## 1. 目的與評估方法

針對現有英文學習平台做一次全面體檢，找出可加強之處，並排出一份可行、分階段、可驗收的改善計畫。

評估方法：**純程式碼與文件審閱**——閱讀全部後端（api / worker / shared）、兩個前端、migration、compose 組態、測試與 fixtures。過程中**未連線任何正式資料庫、未執行任何會變更資料的指令**；音檔大小以 repo 內 `fixtures/seed/audio` 實測。

## 2. 硬性約束（全計畫適用）

1. **不動線上資料**：所有改善工作在本機開發、於獨立測試庫（`docker-compose.test.yml`）驗證。任何會觸及既有正式資料的動作（如既有音檔轉檔、schema migration）都：(a) 單獨列為選擇性任務、(b) 以備份先行為前提、(c) 需另行核可才執行。
2. **不影響用戶隱私**：不新增任何個資蒐集（`users` 維持只存 email / name / role）；不引入第三方分析或追蹤；日誌不記錄 email 等個資（現況已符合，需維持）；備份檔含 email，存放位置須為私人儲存空間，建議加密。
3. **不呼叫真實 LLM 的測試紀律**照舊（CLAUDE.md）：所有新測試一律 mock。

## 3. 現況總評

### 架構速覽

Docker Compose 六服務：`db`（Postgres 16）→ `migrate`（一次性）→ `api`（Fastify）/ `worker`（DB-backed 佇列輪詢）→ `web-admin` / `web-learner`（React + Vite，nginx 同源反代）；`seed` 為 profile 限定的示範資料匯入。`api` 與 `worker` 共用 `audio` volume。驗證採 Cloudflare Access 邊緣驗證 + app 內 `ADMIN_EMAILS` allowlist；LLM 為 Gemini（翻譯 / 解釋 / TTS），金鑰僅存在伺服器端。

### 值得保留的資產（做得好的部分）

- **佇列正確性**：`FOR UPDATE SKIP LOCKED` 原子認領、visibility timeout 回收 stuck job、attempts 上限 + 自動退避重試、手動重試（`shared/src/repo/jobs.ts:51`）。
- **一致性**：段落 / job / 文章狀態在單一交易內更新；文章狀態冪等重算（`worker/src/processor.ts:27`）；併發首查同字以唯一鍵衝突當快取命中處理（`api/src/routes/lookups.ts:163`）。
- **強韌性**：LLM 輸出 Zod 驗證 + 重試、429 快速失敗不浪費重試（`shared/src/llm/tts.ts:24`）、fetch 有 timeout（`shared/src/llm/genai.ts:8`）、TTS 盡力而為單項失敗不拖垮整筆查詢、pool error handler、錯誤不外洩上游內文。
- **測試與資料紀律**：百餘個後端測試全 mock、獨立測試庫（5433 / tmpfs）、fixtures seed 免 LLM 還原示範資料。
- **安全基礎**：金鑰不進前端、`@fastify/static` 防路徑穿越、admin 路由層守衛、`/stats` admin-only。
- **前台體驗核心**：跨段連續播放時間軸（seek / 倍速 / 循環 / 段落高亮，`web-learner/src/useArticlePlayer.ts`）、點字彈窗跨文章累積解釋。

整體判斷：**核心工程品質高，主要缺口在「營運面」**——資產保護（備份）、費用控管、失敗可見性——以及前台的無障礙與細節打磨。

## 4. 評估發現

嚴重度定義：**P0** 可能造成不可逆損失（資料、金錢）；**P1** 明顯影響營運或體驗；**P2** 值得做的改善；**P3** 觀察項（可不做）。

### A. 系統架構

| # | 嚴重度 | 發現 | 依據與影響 |
|---|--------|------|-----------|
| A1 | **P0** | **無備份／還原機制** | `pgdata` 與 `audio` volume 都只存在單一 Mac Mini 上；`deploy.sh` 有會清空 DB 的 `clean` 卻沒有 `backup`。磁碟故障＝文章、翻譯、單字庫、全部音檔消失，重建等於把 LLM 費用再花一次。 |
| A2 | **P0** | **LLM 費用無韁繩** | `POST /lookups`（`api/src/routes/lookups.ts:49`）任何 reader 都可觸發；快取未命中＝1 次 LLM + 最多 6 次 TTS。無任何限流或每日上限——小孩好奇狂點整頁單字，費用直接反映在帳單上。 |
| A3 | P1 | **部署預設偏開發、易誤用** | compose 預設 `DEV_AUTH_BYPASS=1`（`docker-compose.yml:16`）；db 5432 映射到 host（`docker-compose.yml:29`）；`/audio/` 在 app 層即為免驗證公開路徑（`api/src/auth.ts:81`，設計上依賴邊緣的 Cloudflare Access）。若有人直接 port-forward 8080–8082 上網，等於整站無驗證。 |
| A4 | P1 | **音檔用未壓縮 WAV** | TTS 輸出 24kHz/16-bit PCM ≈ 48KB/秒；repo 內 5 篇短示範文章的音檔已 33MB（單段約 370KB）。改壓縮格式（AAC/M4A）體積約可降到 1/10，行動網路載入明顯變快、磁碟與備份成本同步下降。 |
| A5 | P2 | 無失敗告警 | worker 有結構化 log，但只進 `docker logs`；job 反覆失敗不會有人知道。admin 的 stats 已有 failed 計數，缺醒目呈現。 |
| A6 | P2 | README 過期 | 仍寫「目前處於 Phase 0」；seed、測試庫、taxonomy 等後續成果未反映，新機器重建時誤導。 |

### B. 程式邏輯

| # | 嚴重度 | 發現 | 依據與影響 |
|---|--------|------|-----------|
| B1 | P1 | **worker 逐段全序列處理** | 每段依序：翻譯 → 英文 TTS → 中文 TTS（`worker/src/processor.ts:75-92`）。中英 TTS 互不依賴，可並行（`lookups.ts:130` 已示範 `Promise.all`）；一篇 10 段文章的處理時間可再壓低約三成以上。 |
| B2 | P1 | **翻譯缺跨段脈絡** | `translateParagraph` 一次只送一段（`worker/src/processor.ts:75`），跨段代名詞、術語譯法可能不一致。批次版 `generateTranslations`（`shared/src/llm/translate.ts:28`）已存在卻未被 worker 使用。 |
| B3 | P1 | **失敗原因不可見** | `jobs.error` 已忠實記錄（`shared/src/repo/jobs.ts:86`），但 `GET /articles/:id` 不回傳、admin UI 不顯示；管理者只看得到紅色 `failed`，無從判斷是配額、網路還是內容問題。 |
| B4 | P2 | 無「單段重做」 | 已完成段落若翻譯品質差或音檔異常，唯一手段是刪整篇重上（全部費用重花）。 |
| B5 | P2 | 缺音檔無補產工具 | lookups 的 TTS 盡力而為、失敗留 null（`lookups.ts:94` 設計如此），但之後沒有任何補產機制，缺的音永遠缺。 |
| B6 | P3 | 詞形不歸一 | `normalizeWord` 僅小寫 + trim（原設計 §9.1 既定取捨），`run`/`running` 分開累積。維持現狀，列為觀察。 |
| B7 | P3 | 可點字元集限英文 | `ClickableText` 只認 `A-Za-z'-`（`web-learner/src/App.tsx:78`）；對兒童教材影響小，列為觀察。 |

### C. 版面設計（UX）

| # | 嚴重度 | 發現 | 依據與影響 |
|---|--------|------|-----------|
| C1 | P1 | **無障礙缺口** | 可點單字是 `span onClick`（`web-learner/src/App.tsx:81`），無鍵盤焦點、無角色語意；單字彈窗無 ESC 關閉、無焦點管理（`role="dialog"` 缺）。 |
| C2 | P2 | learner 顯示未完成文章 + 英文狀態碼 | 前台清單列出 `pending/failed` 文章且徽章直接顯示英文 enum（`App.tsx:671`）；小朋友點進去是半成品，狀態字也看不懂。 |
| C3 | P2 | 多音源可同時播放 | 解釋彈窗的 `AudioChip` 每次 `new Audio()`（`App.tsx:41`），與全文播放器互不知悉，會疊音。 |
| C4 | P2 | 行動版需一輪實測打磨 | 已有 620/720px 斷點，但篩選列在窄幕擁擠、彈窗長內容捲動、播放列未處理 iOS 底部安全區（`env(safe-area-inset-bottom)`）。 |
| C5 | P2 | 「我的單字本」缺入口 | 資料庫已累積全站共享的單字與多份解釋，前台卻沒有任何瀏覽／複習入口——資料價值未兌現。屬新功能，列為 backlog 候選。 |
| C6 | P3 | admin 小缺口 | 清單無標題搜尋；沒有「在前台開啟這篇」連結；失敗原因顯示同 B3。 |
| C7 | P3 | 卡片封面固定 🌱 | 可依分類換 icon / 色彩，純視覺小優化。 |

### D. 測試與文件

| # | 嚴重度 | 發現 | 依據與影響 |
|---|--------|------|-----------|
| D1 | P2 | 前端零測試 | `useArticlePlayer`（198 行，時間軸/seek/連播/循環）與清單篩選是前端最複雜邏輯，完全無測試；回歸風險集中在這裡。 |
| D2 | P3 | 無自動化 e2e | `e2e/README.md` 為手動清單。可用 Playwright + seed fixtures + `DEV_AUTH_BYPASS` 做「零 LLM 費用」的讀路徑 e2e，列 backlog。 |

## 5. 方案取捨

三種推進方式：

- **方案 A：風險優先、小步快跑（推薦）**——先堵不可逆損失（備份、費用韁繩），再做可見性與效能，最後體驗打磨；每項獨立驗收、隨時可停。理由：資料與錢包的損失無法回復，UX 問題只是可逆的不便；且各項彼此獨立，適合此專案一貫的小步提交節奏。
- **方案 B：體驗優先**——先做 Phase 4 的前台改善（對使用者立即有感），營運風險墊後。適合「近期要密集給小孩使用」的情境，但備份缺口每多開一天就多一天風險。
- **方案 C：平台升級**——物件儲存（S3）、CDN、雲端託管、完整 CI/CD。對家用規模是過度工程、徒增月費；僅在未來「準備對外開放」時重啟評估。

**採用方案 A**，計畫如下。

## 6. 改善計畫（分階段，均可獨立驗收）

### Phase 1 — 資產與費用保護（P0，最優先）

**1.1 備份與還原**
- 新增 `scripts/backup.sh`：`pg_dump`（custom format）+ `audio` volume 打包，輸出到可設定的目的地（外接碟／NAS 路徑），輪替保留最近份數（預設 7 份，env 可調）。
- README 新增「備份與還原」章節：還原步驟、建議的 macOS `launchd` 每日排程設定。
- 隱私：文件明確標註備份含 email，須放私人空間、建議加密。
- **驗收**：在獨立測試堆疊演練 backup → 清空 → restore，文章／段落／單字／音檔筆數與抽樣內容一致。全程不觸正式庫。

**1.2 lookups 用量韁繩**
- `POST /lookups` 快取未命中路徑加兩道限制（env 可調）：per-user 每分鐘上限、全站每日 LLM 呼叫上限；超限回 429 與明確訊息，前端顯示友善提示（例如「今天查太多囉，明天再來」）。快取命中不受限。
- `/stats` 增加今日 lookup / LLM 呼叫計數，admin 可隨時掌握。
- **驗收**：單元測試覆蓋限流命中／未命中／跨日重置；mock client 證明超限時 LLM 呼叫次數為 0。

### Phase 2 — 營運可視性與部署安全（P1）

**2.1 失敗原因可見**：`GET /articles/:id` 回傳各段對應 job 的最近 `error`（截斷）；admin 段落卡與文章列顯示。驗收：模擬失敗後 admin 能看到人類可讀的原因。
**2.2 失敗醒目提示**：admin stats bar 的 failed > 0 時紅色醒目（含文章清單標記）。
**2.3 部署硬化與上線檢查清單**：db 埠改綁 `127.0.0.1`（或移除映射）；README 新增檢查清單——正式環境 `DEV_AUTH_BYPASS=0`、`CF_ACCESS_*` 必填（config 已強制）、對外流量僅經 Cloudflare Access / Tunnel、勿直接 port-forward 8080–8082。
**2.4 README 全面更新**：反映現況（功能、seed、測試庫、部署、備份）。

### Phase 3 — 效能與成本（P1–P2）

**3.1 TTS 並行**：worker 內單段的中英 TTS 改 `Promise.all`；（選配）`WORKER_CONCURRENCY` env 控制多 job 並行度（預設 1，配額緊張時不動）。驗收：mock 計時測試證明單段耗時下降；一篇多段文章 wall-clock 明顯縮短。
**3.2 文章級批次翻譯**：worker 改為整篇一次 `generateTranslations`（跨段脈絡一致），寫回各段後 TTS 照段進行；批次失敗自動退回現行逐段模式。取捨已知：翻譯失敗時重試粒度變粗，以退回機制緩解。驗收：mock 測試證明 LLM 翻譯呼叫由 N 次降為 1 次、各段譯文正確落位。
**3.3 新音檔改壓縮格式**：worker / lookups 產出改存 AAC（M4A，Safari/iOS 相容性最穩）——容器加 ffmpeg，寫檔處統一轉檔；DB 僅存新路徑，程式對副檔名無假設。**既有音檔轉檔為選擇性遷移任務：預設不動線上資料，需備份先行（1.1 完成後）且另行核可。**驗收：新產出音檔可在 Safari / Chrome / iOS 播放，體積 ≤ WAV 的 15%。

### Phase 4 — 學習體驗（P2）

**4.1 learner 只呈現完成的文章**：未完成者隱藏或顯示中文「處理中」不可點卡片；狀態徽章改中文。
**4.2 全域單音源**：任何新播放（解釋音、段落音、全文連播）自動停止其他音源。
**4.3 無障礙**：可點單字改 `<button>`（保留視覺）、彈窗 `role="dialog"` + ESC 關閉 + 焦點返還、播放控制補 aria-label。
**4.4 行動版打磨**：375px 寬實測修版（篩選列、彈窗、播放列 safe-area）。
**4.5 admin 品質工具**：單段「重新產生」（B4）；「補齊缺失音檔」動作（B5）；清單標題搜尋與「在前台開啟」連結（C6）。

### Phase 5 — 品質防護網（P2–P3）

**5.1 前端單元測試**：`useArticlePlayer`（時間軸/seek/連播/循環，stub Audio）與清單篩選邏輯，用 vitest；掛進 `npm test`（不需瀏覽器、不呼叫任何外部服務）。
**5.2（backlog）Playwright e2e**：讀路徑（seed 資料瀏覽、播放、彈窗），零 LLM 費用。
**5.3（backlog）「我的單字本」**：全站單字複習頁。屬新功能，建議另立設計文件走一次完整設計循環。

## 7. 風險與緩解

| 風險 | 緩解 |
|------|------|
| Gemini 429（並行化後更易觸發） | 並行度預設 1、env 可調；429 快速失敗 + job 自動重試機制已存在 |
| 音檔格式相容性 | 選 AAC/M4A（相容性最保守）；上線前在 iOS Safari / Android Chrome 實測；程式不對副檔名做假設 |
| 備份佔空間 | 保留 N 份輪替；Phase 3.3 壓縮完成後備份體積同步下降 |
| 限流誤傷正常使用 | 上限值 env 可調並從寬預設；快取命中不計入 |
| 批次翻譯失敗粒度變粗 | 自動退回逐段模式 |

## 8. 假設與未決事項（審閱時請確認）

1. **使用規模假設**：本計畫以「自家人／小規模、成本敏感」排序（依 CLAUDE.md 費用紀律與家用 Mac Mini 部署推斷）。若近期要開放到班級以上規模，Phase 1.2 與 2.3 維持最優先，另需重新評估帳號與配額設計。
2. **既有音檔是否轉檔**（Phase 3.3 的選擇性遷移）：預設不做；若要做，須在 1.1 備份機制就緒後另行核可。
3. **「我的單字本」**（5.3）：是否納入下一個功能循環？
4. **每日 LLM 上限的預設值**（1.2）：建議 per-user 10 次/分鐘、全站 200 次未命中查詢/日，數值待確認。
5. **告警通知管道**（A5）：目前只做 admin UI 醒目提示；是否需要主動通知（email/webhook）待需求出現再議。

## 9. 後續

本文件經審閱核可後，以 **writing-plans** 技能將 Phase 1 起逐階段拆解為小而可驗證的實作任務（延續本專案「一任務一 commit」的節奏）。
