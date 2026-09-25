# 專案架構與功能導覽（以程式碼為準）

> 供新進 agent 與維護者先建立全貌，再依任務閱讀相關程式。
> 初始分析日期：2026-09-20；初始程式碼基準：`a1f32ea`；最近同步：2026-09-26（Google Vertex AI 語音請求與補檔配額處理）。原始分析時已於本機 Docker 套用 migration、重建啟動供試用；本次生成設定與 Vertex AI 變更尚未套用正式資料庫或部署。
> 本文由實際原始碼、SQL migrations、執行設定、腳本與測試整理，未使用 `docs` 內既有需求／設計文件，也未以 README 的功能敘述代替程式分析。這是現況快照，不是未來需求清單。遇到差異，以當下可執行程式與 migration 為準。

## 1. 先讀這裡：專案目的與全貌

這是一個面向繁體中文使用者的英文閱讀與聆聽平台。管理者整理英文教材，系統產生繁中翻譯與中英語音；學習者閱讀文章、聽朗讀、點選單字查閱語境解釋，也能透過經人工審核的插圖理解內容。從教材分類、圖片提示與 UI 可看出對學校教材及兒童學習情境的支援，但沒有以年齡限制使用者。

產品有兩個介面：**學習前台**與**管理後台**。後端由一個 API、文章 worker、圖片 worker 組成，共用 PostgreSQL；音檔與圖片存放在檔案 volume，DB 保存路徑及 metadata。

四條主流程：

1. **文章教材**：後台輸入標題／英文內文 → API 依空白行切段、建立 DB jobs → worker 翻譯與合成語音 → 前台閱讀、聆聽。
2. **語境單字**：點單字先讀既有解釋 → admin／reviewer 可用本篇脈絡產生解釋 → API 先回文字，再於 API 行程內背景補音檔 → 全站共用。
3. **收藏複習**：單字卡主動收藏 → 保存單字與來源快照 → 快速複習／自行判斷的快速挑戰 → 標熟悉後移出待複習，可重新收藏。
4. **文章插圖**：admin 估價並建立版本 → image-worker 全文規劃、必要時先產生角色參考圖 → 人工審核 → 生成封面與段落圖 → 人工核准、整版發布 → 前台顯示。

新 agent 必須先知道的邊界：

- `done` 是文章翻譯／語音流程的完成狀態，**不代表插圖已發布**；沒有插圖也能閱讀。
- 單字解釋與「已解釋」標記是全站共用資料，**不是個人背單字或學習進度**；主動收藏與熟悉狀態另存於 `vocabulary_items`／`vocabulary_sources`。
- 文章 job、圖片 job、單字背景 TTS 是三種不同機制，不可直接套用同一套重試方式。
- 前後台各有本地型別與 API client；瀏覽器程式沒有直接依賴 `@el/shared`。
- API 沒有統一 `/api` 前綴，使用 `/articles`、`/words` 等頂層路徑，新增路徑要一起檢查反向代理。
- 正式呼叫 LLM／TTS／圖片供應商會產生費用；理解專案與一般測試不需要呼叫它們。

## 2. 架構與程式目錄

```mermaid
flowchart TD
    Browser[瀏覽器] --> Proxy[Nginx 單一入口 :8090]
    Tunnel[Cloudflare Tunnel／Access 外部入口] -. 選用 .-> Proxy
    Proxy --> Learner[web-learner /]
    Proxy --> Admin[web-admin /admin/]
    Proxy --> API[Fastify API :8080]
    Learner -. 同源 HTTP .-> API
    Admin -. 同源 HTTP .-> API
    API --> DB[(PostgreSQL 16)]
    Worker[文章 worker] --> DB
    ImageWorker[image-worker] --> DB
    Worker --> TextSpeech[Vertex AI／OpenAI 翻譯與 TTS]
    API --> Explain[Vertex AI／OpenAI 單字解釋與 TTS]
    ImageWorker --> Planner[Vertex AI／OpenAI 全文圖片規劃]
    ImageWorker --> ImageAPI[Vertex AI／OpenAI 圖片 API]
    Worker --> Audio[(audio volume)]
    API --> Audio
    ImageWorker --> Images[(images volume)]
    API -. 唯讀檔案掛載 .-> Images
```

| 位置 | 責任與優先閱讀入口 |
| --- | --- |
| `package.json` | npm workspaces 與跨 workspace 指令；共五個 workspace |
| `api/src/server.ts` | 組裝正式 config、DB、LLM client、限流與圖片模型可用性；啟動 HTTP |
| `api/src/app.ts` | 可注入依賴的 Fastify 工廠；組裝 auth、路由、音檔服務、錯誤處理 |
| `api/src/routes/` | articles、lookups、vocabulary、taxonomy、users、stats、illustrations 的 HTTP 邊界 |
| `worker/src/index.ts`、`processor.ts` | 文章 jobs 輪詢與處理流程 |
| `worker/src/image-index.ts` | 圖片服務獨立入口；和文章 worker 使用同一 Docker image，但為另一個行程／服務 |
| `shared/src/repo/` | 核心實體的參數化 SQL、查詢、camelCase 映射 |
| `shared/src/db.ts`、`config.ts`、`schemas.ts` | DB pool／交易、環境設定驗證、核心 Zod 契約 |
| `shared/src/llm/`、`generationSettings.ts`、`generationClients.ts` | Google／OpenAI 文字與語音 client、載入 config 模型清單／驗證及依工作設定建立 client |
| `shared/src/audioFiles.ts`、`audioEncode.ts` | 共用音檔寫入／刪除與 ffmpeg 編碼 |
| `shared/src/illustrations/` | 圖片契約、模型／價格目錄、版本與審核、佇列、供應商、檔案儲存 |
| `web-learner/src/` | React 學習前台；`App.tsx`、`useArticlePlayer.ts`、`AudioBar.tsx`、`Illustration.tsx` |
| `web-admin/src/` | React 後台；`App.tsx` 管主要頁面，`GenerationSettings.tsx` 管文字／語音／圖片三項生成設定，`AudioBackfillPanel.tsx` 管缺失音檔，`Illustrations.tsx` 管圖片生命週期 |
| `migrations/` | DB 結構的可執行演進；不能只讀初始 migration 判定現況 |
| `config/generation-models.json`、`image-models.json`、`image-pricing.json` | 共用文字／語音模型與聲線、圖檔模型與參數、圖片及規劃費率 |
| `docker-compose.yml`、各 Dockerfile | 部署服務、相依啟動順序、掛載、ports、healthcheck |
| `proxy/nginx.conf`、兩個前端 nginx／Vite 設定 | 正式與開發環境的路徑轉發 |
| `scripts/`、`fixtures/seed/` | 部署、備份、免 LLM 示範資料匯入 |
| `.github/workflows/ci.yml` | Node 20 CI：安裝、型別檢查、測試、前端 build、測試庫清理 |

技術組合：TypeScript、Node 20、Fastify 4、React 18、Vite 5、PostgreSQL 16、`pg`、Zod、Vitest；前端測試使用 happy-dom／Testing Library；圖片轉檔用 sharp，音訊轉檔用 ffmpeg。版本以各 `package.json` 與 lockfile 為準。

後端使用 `tsx` 直接執行 TypeScript；`@el/shared` 匯出 `src/index.ts`，沒有獨立的 shared 編譯產物。根目錄 `npm run build` 實際主要建置兩個前端，不會把 API／worker 編譯為另一套 JS dist。

## 3. 使用者與權限

依據：`api/src/auth.ts`、`api/src/routes/users.ts`、`shared/src/repo/users.ts`。

| 能力 | reader | reviewer | admin |
| --- | --- | --- | --- |
| 讀文章、既有單字解釋與已發布圖片 | 可 | 可 | 可 |
| 收藏、複習、熟悉狀態與取消收藏 | 可 | 可 | 可 |
| 以本篇脈絡產生單字解釋 | 不可 | 可 | 可 |
| 文章新增／修改 metadata／刪除／重試／重生 | 不可 | 不可 | 可 |
| 分類標籤異動、單字解釋刪除、補音檔 | 不可 | 不可 | 可 |
| 插圖估價／生成／審核／發布、查看草稿圖 | 不可 | 不可 | 可 |
| 讀寫生成供應商與模型設定 | 不可 | 不可 | 可 |
| 統計、使用者角色管理 | 不可 | 不可 | 可 |

`reviewer` 是單字內容產生權限；名稱不表示具有圖片審核權限。後台介面不是最終安全邊界，權限由 API `requireAdmin`／`requireReviewer` 判斷。

- 正常模式取 `Cf-Access-Jwt-Assertion`，使用 team domain 的 JWKS 驗簽、檢查 audience 並取 email；本專案沒有密碼登入／註冊／重設密碼流程。
- `DEV_AUTH_BYPASS` 開啟時，改用 `DEV_USER_EMAIL`。Compose 預設提供 bypass；這是開發預設，不代表正式環境應維持此設定。
- 每次受保護請求透過 `ensureUser` 建立使用者或更新 `last_seen_at`，不覆寫既有 DB 角色。
- `ADMIN_EMAILS` 優先決定有效 admin 身分；未命中時沿用 DB role。DB enum 仍容許 `admin`，因此不能宣稱程式在任何情況都只接受環境變數 admin。
- 管理 API 只能指派 `reader`／`reviewer`，支援預先建立 email；新建但尚未登入者的 `last_seen_at` 為 null。此操作不等於替 Cloudflare Access 設定通行名單。
- 應用層預設放行 `/healthz`、`/audio/` 路徑；`/images/*` 要驗證身分，非 admin 只能取目前發布版本選用的圖片。外部 Cloudflare Access 規則不在程式庫內，不能僅憑本機設定斷言線上保護情況。

## 4. 學習前台功能

依據：`web-learner/src/App.tsx`、`VocabularyReview.tsx`、`lib/`、`useArticlePlayer.ts`、`Illustration.tsx`。

### 文章瀏覽與閱讀

- 清單僅顯示 `status === "done"` 的文章；API 本身仍回所有狀態的文章，詳情 API 也沒有以 done 限制讀取。
- 分為課業內 `school` 與課外 `extracurricular`；可依年級、單元、難度、分類及標籤篩選，搜尋只比對標題。多個標籤須全部符合（AND）。篩選在瀏覽器進行，選項由已載入文章萃取。
- 用 `#/a/<id>` 定位文章，支援瀏覽器上一頁／下一頁、來源文章跳轉與分享；分享優先呼叫系統分享，再退回複製連結。
- 各段英文拆成可點單字；逐段或一次展開／收合繁中翻譯，可播放中文朗讀。
- 文章卡片、閱讀頁與播放器顯示已發布封面；無圖或載入失敗時回退至既有漸層／emoji。段落圖缺失或失敗則省略。
- 圖片上的教學單字是 HTML 按鈕，依人工審核的 0–1 座標放置，可隱藏；點擊沿用單字查詢彈窗，不是燒在圖片中的文字。

### 音訊體驗

- 全文英文朗讀由多個段落音檔串接成虛擬時間軸，沒有生成一個全文合併音檔。
- 預載每段音訊 metadata 取得時長；支援跳段、進度拖曳、暫停續播、0.5／0.75／1／1.25／1.5／2 倍速與全文循環。
- 單段按鈕播放完即停；全文模式才自動接下一段，並跟隨目前段落捲動與高亮。
- 空白鍵播放／暫停、左右鍵切段；彈窗開啟或焦點在輸入／按鈕元件時不攔截。
- `lib/audioBus.ts` 協調全文播放器、中文朗讀與單字語音，開始新音源時暫停前一個。

### 單字彈窗

顯示全站該字的多篇來源解釋、中英解釋與例句、英文發音、片語 `headword`，可跳回來源文章及開啟 Google 圖片搜尋。例句與解釋使用相同文字樣式；只提供單字、英文解釋與英文例句的播放按鈕。admin／reviewer 額外看到「用本篇重新解釋」及後台單字連結；後台管理操作本身仍限 admin。

畫面標為「本篇已解釋」後不提供直接強制覆寫按鈕。單字卡提供主動收藏；開啟彈窗本身不收藏，沒有解釋仍能收藏，不呼叫 AI 產生內容。播放器位置與翻譯展開等主要保存在 React state，尚無持久化的閱讀進度。

### 收藏與複習

- `#/review` 開啟 `VocabularyReview.tsx`。同字合併呈現並保留多篇／多段來源，熟悉狀態作用於整個單字。
- 可同時篩選課業內／課外、單元、課文、年級、類別及收藏日期；來源條件必須由同一筆來源全部符合，分類採收藏時快照。篩選區可收合，收合後顯示目前範圍摘要，不清除條件。
- 收藏日期依 item 的 `savedAt` 換算 `Asia/Taipei` 日，區間含起迄日；來源日期僅供資訊。篩選存於 sessionStorage，回課文再返回複習可保留。
- 快速複習直接顯示原文與既有解釋，優先所選來源課文的解釋；快速挑戰先隱藏原文與答案，揭曉後自行選「記得／忘記」。每張卡片的熟悉狀態、下一個及取消收藏操作位於內容上方。記得或手動已熟悉將單字移出待複習，忘記保留並換下一張。
- `mastered` 紀錄保留且可重新收藏；取消收藏只刪收藏及其來源，不刪共用單字、解釋或課文。
- 回原文使用 `#/a/<id>?paragraph=<id>&word=<word>&from=review` 定位段落／標字；課文刪除後仍保留來源快照，但不提供返回該課文的按鈕。
- 複習音訊沿用 audioBus，提供單字與英文解釋、英文例句音訊；切換卡片／模式時停止音訊，挑戰揭曉狀態重設。API 載入或異動失敗會顯示錯誤，不先移除收藏。

## 5. 管理後台功能

依據：`web-admin/src/App.tsx`、`api.ts`、`lib/meta.ts`、`Illustrations.tsx`。

| 區域 | 已實作行為 |
| --- | --- |
| 文章清單 | 含所有處理狀態；標題／教材／分類標籤篩選；依畫面高度計算每頁筆數；前台閱讀連結；刪除 |
| 新增文章 | 表單貼入英文純文字與 metadata；不是 PDF／Word 檔案解析上傳 |
| metadata 編輯 | 標題、教材別、年級、單元、難度、分類、標籤；內文不在此修改 |
| 文章詳情 | 各段原文、翻譯、狀態、最近 job 錯誤及中英音檔；重試失敗段落與指定產物重生 |
| 分類／標籤 | 分類建立、改名、刪除；UI 提供母／子分類；標籤依 kind 分組，支援單項編輯及整組 kind 改名 |
| 單字管理 | 搜尋、展開來源解釋、刪單筆解釋或整個單字；支援進站 `#/w/<word>` 深連結 |
| 補缺音檔 | 文章清單按鈕切換到獨立的缺檔頁，與文章搜尋／篩選分開；一個待補音檔一列（單字發音跨來源只列一次、英文解釋、英文例句）。可逐檔補齊，或補齊完整清單並查看進度、失敗數；頁內搜尋只影響顯示，不縮小全部補檔範圍。可返回文章清單。舊批次 API 每次仍最多掃描 10 個單字與 10 筆解釋 |
| 使用者 | 列表、最後出現時間、reader／reviewer 指派及預先指派 |
| 統計 | 文章／段落／文章 jobs 狀態數、單字／解釋數、當日受限流計數；不是個人學習分析 |
| AI 圖片 | 可用模型、估價／預算、版本清單、生成狀態、候選 prompt、圖片與教學詞位置審核、重生／略過、取消／刪除／發布 |
| 生成設定 | 文字、語音、圖片各自選 Google／OpenAI 與模型；文字共用於翻譯、單字解釋與圖片全文規劃，語音可選中英文聲線。顯示憑證可用狀態，儲存採版本檢查 |

文章列表與詳情每 3 秒輪詢，統計每 5 秒，圖片面板每 3 秒。沒有 WebSocket／SSE。後台主要用 `view` state 換頁，沒有完整的 React Router 路由表。

## 6. 文章處理資料流與狀態

入口：`api/src/routes/articles.ts` → `shared/src/repo/{articles,paragraphs,jobs}.ts` → `worker/src/processor.ts`。

1. `POST /articles` 驗證 JSON，`splitParagraphs` 以空白行切段並去除空段。
2. 同一 DB transaction 讀取生成設定，建立文章、分類／標籤關聯、依序 `idx` 的段落，以及每段一個帶翻譯與音檔設定快照的 job；回 `202 { id }`，不等待 AI 完成。
3. worker 用 `claimNextJob` 原子認領一筆到期 pending job，或回收超過期限的 processing job；使用 `FOR UPDATE SKIP LOCKED`，認領時增加 attempts。
4. 缺翻譯且同篇有多個缺譯段落、其翻譯模型快照相同時，先嘗試批次翻譯；批次失敗或快照不同時回退逐段。已有翻譯沿用。
5. 缺英文／中文音檔才呼叫 TTS；同段的兩種語言並行。檔案在 DB transaction 外寫入。
6. 成功後以 transaction 更新段落與 job 為 done，重算文章狀態。

文章重算規則：尚有 pending／processing 段落 → processing；否則有 failed → failed；否則 done。雖然共用 enum 包含 processing，現有處理器認領時主要更新 job，並未同步把段落設為 processing；不要假設三張表每一刻狀態一致。

失敗未達上限時退回 pending，以 `available_at` 延遲；預設最多 3 次嘗試，退避 `30 × 2^(attempts−1)` 秒、上限 900 秒。stale 預設 5 分鐘，poll 間隔預設 3 秒；每輪 drain 完成才排下一輪。

手動處理：

- 整篇 retry 只重設 failed 段落／jobs，attempts 歸零、立即可取，文章設為 processing。
- 自動重試與整篇 failed retry 沿用原 job 設定快照；單段手動重生改取當下生成設定。遷移前沒有快照的舊 job 在處理時取當下設定。
- `scope=translation` 清翻譯及中文音檔，保留英文音檔。
- `scope=audio-en` 或 `audio-zh` 只清指定音檔；worker 依 null 欄位決定重做內容。
- 刪文章由 DB cascade 清段落、jobs、文章解釋與圖片版本等；API 盡力刪文章／解釋音檔目錄，保留跨文章共用單字發音。圖片檔案由獨立 cleanup queue 處理。

LLM 層另有短期重試與 HTTP timeout；它和 DB job 重試是兩層，不能把 attempts 當作實際供應商呼叫次數。一般 Gemini 請求 timeout 預設 60 秒；429／RESOURCE_EXHAUSTED 與不可重試的 HTTP 4xx 在 LLM 層快速失敗，交由上層處理。Vertex AI 語音請求明確帶 `contents.role = "user"`。

## 7. 語境單字資料流

入口：`api/src/routes/lookups.ts` → `shared/src/llm/explainWord.ts` 與 `shared/src/repo/wordExplanations.ts`。

1. 點字先 `GET /words/:word/explanations`，此讀取不觸發 LLM。
2. admin／reviewer 才能 `POST /lookups`，帶 `{ articleId, paragraphId, word }`。
3. `normalizeWord` 只 trim＋轉小寫，**不做詞形還原**；`run` 與 `running` 是不同 key。
4. `words` 全站唯一；解釋唯一鍵是 `(word_id, article_id)`，不是 paragraph 或 user。paragraph 提供首次生成的上下文。
5. 快取命中直接回既有結果，不消耗本次限流額度、不重生音訊。「重新解釋」表示換本篇語境，並非強制覆寫本篇快取。
6. 未命中先通過 per-user 每分鐘與全站每日限額，預設 10／200，再讀取當下單字解釋與音檔設定，產生五種文字內容及 `headword`。
7. 先存文字、回 `201`；API 行程以 fire-and-forget 補單字英文發音、英文解釋與英文例句音檔。中文內容只存文字，不再產生或補齊中文音檔。各 TTS 失敗可留下 null，文字仍可使用。
8. 前台提交後每 5 秒重抓、最多 4 次；admin 可由缺檔清單逐檔或全部補齊。清單與單檔操作執行時重新檢查缺漏，全部補檔由前台依清單逐列呼叫 API，避免單次請求過長；遇供應商 429 配額限制會等待 60 秒後重試同一筆，若仍受限就停止並保留剩餘清單。其他失敗項保留供重試。並行首查時靠唯一鍵避免重複資料，衝突請求回既有解釋；不保證首查併發只打一次 LLM。

五組文字內容是：英文解釋、英文例句、繁中翻譯、中文解釋、中文例句。資料庫仍保留舊中文音檔欄位與檔案以相容既有資料，前台不播放；無需清理正式庫。`headword` 可以是原文片語，但快取 key 仍為使用者點的 normalized word。

`GET /articles/:id/lookups` 的意思是「本篇出現、且全站任何來源已有解釋的字」；不是「本篇產生的解釋」或「我查過的字」。後台 `/articles/:id/explanations` 才列出本篇來源的解釋。

限流資料只存在單一 API 行程記憶體，重啟歸零，按伺服器本地日期換日。統計 `lookupsToday.llmCalls` 是放行次數，並不是含所有重試／TTS／圖片的完整 API 費用帳。

### 收藏資料流

入口：`api/src/routes/vocabulary.ts` → `shared/src/repo/vocabulary.ts`。沿用登入身分，reader 亦可操作自己的收藏；服務端取 `request.user.id`，不接受任意 owner。

`POST /vocabulary` 驗證文章與段落歸屬，再以交易儲存正規化字面與文章標題、原文、分類快照。既有 active 字加入來源不改 item 收藏日期；mastered 字從課文重新收藏會恢復 active，更新 item 與指定來源日期。`PATCH /vocabulary/:id` 從 mastered 恢復 active 時只更新 item 日期，保留來源原日期。重複收藏同一 active 來源不更新快照／日期；收藏異動透過 owner row lock 序列化。

## 8. 圖片子系統

入口：`web-admin/src/Illustrations.tsx` → `api/src/routes/illustrations.ts` → `shared/src/illustrations/` → `worker/src/image-index.ts`。

### 模型、估價與版本

- `catalog.ts` 驗證模型 provider、adapter、用途參數及對應價格；設定從兩個 JSON 載入，沒有線上自動查價。
- 程式庫目前設定包含 OpenAI 與 Gemini 圖片模型；後台生成設定決定圖檔模型與 Google／OpenAI 全文規劃模型。估價與生成版本保存模型及規劃器快照。這只描述 repo 設定，不代表已驗證供應商當日型號、價格或線上可用性。
- image-worker 每 15 秒在 DB 宣告模型 ID／設定 hash；API 僅列出最近 60 秒心跳且 hash 相符的模型。
- 圖片入口要求文章 done、1–200 段；新 run 的 scope 只接受 `{ kind: "all" }`。既有 run 中可針對 slot 重生，不等於支援任意新 run scope。
- estimate 保存來源／模型／價格 hash 及 snapshot，10 分鐘有效，綁文章與建立者。預估包含 planner、封面、各段插圖及最多一張角色參考圖；預設最高預算為基礎估價兩倍，目前上限 USD 100。
- 金額以 `usd_micros` 整數保存（1 USD = 1,000,000 micros）。估價是程式內預算依據，不是供應商帳單保證。
- 建 run 再核對來源與設定、消耗 estimate，使用 idempotency key 防重複建立，保存 revision 與當時所有設定。

### 規劃、生成、審核、發布

```mermaid
flowchart LR
    E[估價] --> P[pending / planning]
    P --> C{有固定角色？}
    C -->|有| R[角色參考圖／waiting_reference_review]
    R -->|admin 核准| G[generating]
    C -->|無| G
    G --> V[review]
    V -->|必要圖片核准且來源一致| U[published]
    U -->|新版發布| S[superseded]
    G --> F[partial_failed / failed]
```

這是主要成功路徑；取消、重試、結果不明另由狀態守衛處理。

- planner 產出全文摘要、風格／角色設定、封面 brief，以及完整段落計畫；檢查 ID／idx 與原文一致，教學詞必須是原文完整 token，每段至多 3 個。
- 規劃回應的教學詞由程式計算 `normalizedWord`，逐筆核對原文（含大小寫）後，依正規化單字合併重複項目並保留第一筆，合併後仍須符合每段至多 3 個的限制。不猜測單複數或改寫原文字詞；詞組或不符合原文的教學詞會略過，全部略過時仍可用空標籤清單繼續產圖，原因存於 `plan_json.validationWarnings` 並在後台「教學單字調整」顯示。提示包含段落 ID、教學詞位置與可安全顯示的錯字，異常字元僅顯示位置；核心規劃結構、其他標籤欄位格式、數量上限與人工審核仍採嚴格驗證。
- Gemini 規劃請求的 JSON Schema 僅約束欄位、型別與必填結構，避免巢狀陣列長度及數值上下界造成供應商 `too many states` 拒絕；數量限制由 prompt 提示，回應仍經 `contracts.ts` 的 Zod 與原文一致性驗證後才可生成圖片。
- 有 recurring characters 才建立 reference slot。參考圖未核准前，封面與正文 job 雖已建立，仍不能送出生成。
- 每次供應商工作在 run lock 下預留預算，並記錄 attempt、lease token、prompt／request fingerprint、usage 與計費狀態。
- `providers.ts` 隔離 OpenAI Images 與 Gemini transport；有參考圖時 OpenAI 使用 edits。內部冪等 key 不等於供應商保證不重複計費。
- 圖片回來後 sharp 產生 master、web；封面另有 card 640×360、hero 1280×720、player 160×160。段落 web 保持完整構圖，單字座標以此為準。
- 管理者審核 alt text、內容／安全、教學詞位置；段落圖可從該版本保存的原文選字，填寫圖中物件與學習說明後新增標籤（每圖最多 3 個、不重複，移除後可再加）。新增標籤須點圖或輸入 X／Y 完成定位，再以「核准並選用」儲存，不重新產圖。封面、角色參考圖、不可審核的候選與唯讀版本不提供新增；沒有原文快照也不提供新增。伺服器已存內容未變時，輪詢保留尚未儲存的審核草稿；候選身分或版本改變時重設。拒絕必須給原因；reference 一旦進入正文生成就不可任意替換。
- 只可略過段落 slot 且須原因；封面不能略過。發布要求 run 在 review、來源 hash 未變、必要圖皆已核准且有 alt text／asset。
- 發布以 transaction 切換 `article_visual_publications`，前一版標為 superseded；前台只拿發布資料，不接收草稿 prompt、模型成本或候選歷史。
- 已發布／被取代／取消版本不可原地編輯；新版生成期間舊發布版仍可閱讀。

### 故障與儲存

明確可重試的 provider 錯誤有有限重試與退避；網路中斷或已送出但結果未知時標為 `uncertain`，保留可能費用、不自動重送。job 每 15 秒續期，超過 10 分鐘沒有更新的 processing job 由 recovery 保守標為 uncertain；人工重生需明確接受可能重複費用。

`LocalImageStorage` 把檔案寫到 `articles/<articleId>/runs/<runId>/<assetUuid>/`，API 將 images volume 唯讀掛載。刪版本／文章透過 DB trigger 釋放無引用 asset，將檔案加入 `illustration_cleanup_jobs`；image-worker 執行實體清理並重試。圖片 worker 沒開時，即使 DB 刪除完成，檔案清理仍可能等待。

schema 保留 `derive`／`qa` job kind 等欄位，但目前主流程實際排程的是 `plan`／`generate`；不能僅看到 enum 就宣稱有獨立自動 QA 或衍生圖 pipeline。

## 9. 資料模型與契約

依據：`migrations/*.sql`、`shared/src/schemas.ts`、`shared/src/repo/`、`shared/src/illustrations/repository.ts`。

| 資料群 | 表與關係 |
| --- | --- |
| 使用者 | `users`：email unique，role、last_seen_at；文章／圖片建立及審核者引用 user |
| 教材 | `articles` 一對多 `paragraphs`；段落 `(article_id, idx)` unique；`jobs` 引用 article 與 paragraph |
| 生成設定 | `generation_settings` 單筆保存文字、語音、圖片三項設定與版本；`jobs.generation_snapshot` 保存文章翻譯／音檔在建立時的選擇，舊快照仍可沿用 |
| 分類 | `categories.parent_id` 自我參照樹；文章至多一個 category，刪分類時文章關聯 SET NULL，子分類 CASCADE |
| 標籤 | `tags(kind,label)` unique；`article_tags` 多對多 |
| 單字 | `words.normalized_word` unique；`word_explanations(word_id,article_id)` unique，保存 paragraph 脈絡及五組產物 |
| 收藏 | `vocabulary_items(user_id,word)` unique，保存 active／mastered 與 saved_at；`vocabulary_sources` 保存來源／分類快照，來源 unique `(item_id,article_id,paragraph_id)`；文章／段落刪除時 FK SET NULL，收藏刪除時來源 CASCADE；不依賴共用 words FK |
| 圖片估價／版本 | `illustration_estimates`、`article_visual_runs`、`article_visual_publications`；每篇只有一個目前發布指標 |
| 圖片內容 | `illustration_slots` 表示 cover／paragraph／reference；每 slot 多個 candidates，selected candidate 有歸屬約束 |
| 圖片檔案 | `illustration_assets` 與 `illustration_asset_files` 一對多；variant、object key、尺寸、MIME、bytes |
| 圖片執行紀錄 | `illustration_jobs`、`illustration_attempts`、`illustration_audit_events`、`image_worker_heartbeats`、`illustration_cleanup_jobs` |

補充契約：

- `week`、`page` 存在 DB／核心 Article schema，新增 API 可接收；目前管理表單與 metadata PATCH 並未完整提供此兩欄操作。
- DB categories 可表達多層樹，後台選擇 UI 主要為兩層；不要把 UI 層數誤當 DB 限制。
- 核心 repo 將 snake_case／BIGINT／timestamp 映射為 camelCase／number／ISO 字串。圖片管理 API 大量直接返回 DB row，含 snake_case，前端亦以對應型別處理；整個 API 並非完全統一 DTO 命名。
- `schemas.ts` 不涵蓋每個實際 HTTP payload：如 `POST /lookups` 回單筆 `explanation`，GET 則回 `explanations`；圖片、category、tags 等也有額外 DTO。改契約要同看路由及兩端本地型別。
- DB 音檔欄位存相對路徑：`articles/<id>/p<idx>.en|zh.<ext>`、`words/<id>/en.<ext>`、`words/<id>/a<articleId>/<content>.<ext>`。
- 新音檔預設 AAC/M4A；ffmpeg 不可用或失敗回退 WAV，既有 WAV 可共存，前端應使用 API 提供的實際路徑。

## 10. API 查找表

以下省略逐欄 JSON 規格，以對應路由檔內 validator 為準。一般讀取仍須驗證身分。

| 路由 | 權限／用途 | 原始碼 |
| --- | --- | --- |
| `GET /healthz`、`GET /me` | 健康檢查公開；目前身分需驗證 | `api/src/app.ts` |
| `GET /audio/*` | 應用層公開音檔 | `api/src/static.ts` |
| `GET /articles`、`GET /articles/:id` | 文章清單／詳情，附已發布圖片 | `api/src/routes/articles.ts` |
| `POST /articles`、`PATCH /articles/:id`、`DELETE /articles/:id` | admin 文章管理 | 同上 |
| `POST /articles/:id/retry`、`POST /articles/:id/paragraphs/:pid/regenerate` | admin 重試／指定產物重生 | 同上 |
| `GET /words/:word/explanations`、`GET /articles/:id/lookups` | 既有解釋／全站已解釋字標記 | `api/src/routes/lookups.ts` |
| `GET/POST /vocabulary`、`PATCH/DELETE /vocabulary/:id` | 已登入使用者列出／收藏／改熟悉狀態／取消收藏；不產生 AI 內容 | `api/src/routes/vocabulary.ts` |
| `POST /lookups` | admin／reviewer 語境解釋 | `api/src/routes/lookups.ts` |
| `GET /words`、`GET /articles/:id/explanations` | admin 搜尋／文章來源解釋 | 同上 |
| `DELETE /words/:id`、`DELETE /explanations/:id`、`GET /lookups/missing-audio`、`POST /lookups/backfill-audio` | admin 刪除／列出缺檔／補音檔；POST 帶 `{kind,id}` 補單檔，無 body 沿用舊批次模式 | 同上 |
| `GET/POST /categories`、`PATCH/DELETE /categories/:id` | 讀取需登入；異動限 admin | `api/src/routes/taxonomy.ts` |
| `GET/POST /tags`、`PATCH/DELETE /tags/:id`、`POST /tag-kinds/rename` | 同上 | 同上 |
| `GET/POST /users`、`PUT /users/:email/role` | admin 使用者管理 | `api/src/routes/users.ts` |
| `GET /stats` | admin 統計 | `api/src/routes/stats.ts` |
| `GET/PUT /generation-settings` | admin 讀取可選模型、憑證狀態及更新三項設定；PUT 帶版本避免覆寫 | `api/src/routes/generationSettings.ts` |
| `GET /image-models`、`POST /articles/:id/illustration-estimates` | admin 可用模型／估價 | `api/src/routes/illustrations.ts` |
| `GET/POST /articles/:id/illustration-runs` | admin 版本列表／建立 | 同上 |
| `GET/DELETE /articles/:id/illustration-runs/:runId` | admin 詳情／刪除 | 同上 |
| `POST .../:runId/cancel`、`POST .../:runId/publish` | admin 取消／發布 | 同上 |
| `POST .../:runId/candidates/:candidateId/review` | admin 候選審核 | 同上 |
| `POST .../:runId/slots/:slotId/regenerate`、`POST .../:runId/slots/:slotId/skip` | admin 重生／略過 | 同上 |
| `GET /images/*` | admin 可讀草稿；其他身分限目前發布的選用圖 | 同上 |

圖片路由只在 `buildApp` 提供 illustrations dependencies 時掛載；正式 `server.ts` 由 `IMAGE_MODELS_FILE` 決定是否載入 catalog。POST lookup／backfill 也需要 lookup dependencies；這是可測試組裝方式，不代表正式 server 預設缺少它們。

## 11. 執行、部署與測試

### 服務拓撲與設定

Compose 先啟動 DB，migrate 成功後啟動 API／worker，再啟動兩個前端。主入口預設 `8090`；API 綁 `127.0.0.1:8080`，DB 綁 `127.0.0.1:5432`，兩前端另開 `8081`／`8082`。Vite dev 預設為 admin `5173`、learner `5174`。

- 環境設定由 `shared/src/config.ts` 讀取：DB、音檔、選用供應商的憑證、Access、admin emails、lookup limits、音訊格式、圖片路徑及 catalog。Google 與 OpenAI 憑證可擇一或並存。Google 各工作共用 Vertex AI `generateContent`，`GOOGLE_CLOUD_PROJECT` 與 `GOOGLE_CLOUD_LOCATION` 組成端點；`global` 使用 `aiplatform.googleapis.com`。授權優先使用可呼叫 Agent Platform API 的 `GEMINI_API_KEY`，其次使用 `GOOGLE_APPLICATION_CREDENTIALS` 指定的 ADC；無憑證時不列為可用供應商。
- 文字、語音、圖片三項生成設定存於 DB `generation_settings`，由 admin 的 `/generation-settings` 讀寫。共用文字設定供翻譯、單字解釋與圖片全文規劃使用；可選文字／語音模型與聲線由 `config/generation-models.json` 載入，圖檔模型由 `config/image-models.json` 載入。圖片與規劃費率由 `config/image-pricing.json` 定義，新增文字模型須有規劃費率才可儲存。設定檔在後端行程啟動時讀取，修改後需重啟相關服務；既有工作快照不會自動變更。舊五項設定升級時以「文章翻譯」模型作為共用文字模型。Vertex AI TTS 使用 `gemini-2.5-flash-tts`／`gemini-2.5-pro-tts`；migration 更新目前後台設定中的舊 preview 型號，舊 job 快照在送出時映射，已生成音檔不重做。
- 文字選項包含 Vertex AI `gemini-3.8-flash`，圖片規劃對此模型使用 `thinkingLevel=LOW`；其規劃費率目前採官方截至 2026-12-31 的優惠價，2027-01-01 須更新價格。`gemini-3.8-flash-lite-tts` 未列入 Vertex AI `global` 可用模型清單，因此語音選項尚未加入它。
- `VITE_*` 是前端建置設定。Compose 用 `LEARNER_URL_PUBLIC`／`ADMIN_URL_PUBLIC` 轉為 build args；改連結通常要重新 build，不能只重啟舊前端映像。
- 裸 `docker compose up` 不會啟用 images profile；**`scripts/deploy.sh` 預設加 `--profile images`**，因此完整部署包含 image-worker。tunnel、seed 仍各自為選用 profile。
- proxy 以 `proxy/` 目錄掛載 nginx 設定，避免單檔掛載在原子替換後指向已刪除 inode；從舊版單檔掛載升級需只重建 proxy 容器，單純 restart 不會更新掛載。
- 三個後端服務以 `config/` 目錄掛載模型與價格清單，避免編輯器原子替換 JSON 後容器仍讀到舊 inode；從單檔掛載升級需重建相關容器，之後修改清單重啟服務即可讀取。
- image-worker 至少要有一種可用圖片供應商憑證；只宣告可執行的模型。選定的圖片規劃供應商也要有對應憑證，否則該工作會失敗；開啟 profile 就可能開始處理既有待辦。
- `/healthz` 只回 API 存活，不查 DB／供應商；文章 worker healthcheck 看 heartbeat 檔，image-worker 的容器 healthcheck 被停用，另以 DB 心跳判斷模型可用性。不能把容器 healthy 等同所有業務流程正常。
- `scripts/backup.sh` 實際備份 DB custom dump、audio.tgz、images.tgz，預設保留最近 7 份；檔頭註解未完整反映圖片備份，應以執行段落為準。

### 常用指令及作用

| 指令 | 作用／注意事項 |
| --- | --- |
| `npm ci` | 按 lockfile 安裝 workspaces |
| `npm run typecheck` | 各 workspace `tsc --noEmit` |
| `npm test` | pretest 啟動獨立測試 DB、套 migration，再執行 workspace tests |
| `npm run test:db:down` | 移除測試堆疊與測試 volume |
| `npm run build` | 執行有 build script 的 workspaces，目前主要是兩前端 |
| `./scripts/deploy.sh up` | 建置、啟動、等 healthy／running，重讀 proxy 設定；會啟用圖片服務 |
| `./scripts/deploy.sh status` | 查看部署服務狀態 |
| `npm run seed` | 由 fixtures 匯入既有翻譯／音檔，不呼叫 LLM；會刪除並重建同標題示範文章 |
| `./scripts/backup.sh` | 備份 DB／音檔／圖片並輪替 |

seed 不是純新增或唯讀檢查，重跑可能更換文章 ID 並 cascade 清關聯；不要為了看畫面就對已有資料庫隨意執行。`deploy.sh clean` 會移除正式 volumes，不是一般測試清理指令。

### 測試地圖

- `shared/src/testing.ts` 只讀 `TEST_DATABASE_URL`，忽略正式 `DATABASE_URL`，要求 DB 名稱以 `_test` 結尾；預設 `localhost:5433/english_learning_test`。
- `docker-compose.test.yml` 使用獨立 project name、PostgreSQL tmpfs。DB 整合測試會 TRUNCATE；共用 DB 的測試不要自行改成跨檔／跨執行器並行。
- `shared/src/**/*.test.ts`：設定、核心契約、DB／repo、斷詞、音檔、LLM JSON／重試、圖片 catalog／plan／provider。
- `api/src/routes/*.test.ts`、`auth.test.ts`：以 Fastify inject、測試 DB、fake client 驗證權限、CRUD、快取、TTS 背景補齊、圖片全生命週期。
- `worker/src/processor.test.ts`：批次翻譯／回退、部分重生、退避、stale 回收、狀態聚合。
- 前端 `*.test.ts(x)`：純函式、路由、分享、音源仲裁、播放器、圖片 fallback／單字操作、後台錯誤與圖片審核操作。
- 收藏測試：`api/src/routes/vocabulary.test.ts` 驗證 CRUD、日期／來源語意及權限；`web-learner/src/VocabularyReview.test.tsx` 驗證篩選、挑戰、失敗保留、來源失效與音訊停止；App 與 route 測試涵蓋收藏入口及返回定位。
- `api/src/routeConfig.test.ts`：檢查兩前端使用的 API 頂層路徑是否被 nginx／Vite 正確轉發。
- 現有 `e2e/` 未提供自動瀏覽器測試程式；不要把 Vitest 全綠宣稱為完整線上端到端驗收。

本章列出測試設計與入口；本次實際執行結果以任務交付回報為準，不代表正式部署或完整線上端到端驗收。

## 12. 維護時要辨識的現況限制

以下為程式碼觀察，用於避免誤判；不是本次擅自新增的修正需求。

| 現況 | 影響／修改時的查找點 |
| --- | --- |
| 前後台各自維護 types、facets、API 封裝 | 改 DTO／欄位時同步檢查兩個 `src/types.ts`、client 與 server；不能只改 shared schema |
| 大量 UI／互動集中在兩個 `App.tsx` | 同檔可能影響清單、詳情、角色、單字等；先定位 function 再改 |
| 單字 TTS 為 API 行程內背景工作 | 重啟不會自動恢復該 promise；由補缺功能修復，與 durable jobs 不同 |
| lookup POST 檢查 article／paragraph 各自存在，但未核對 paragraph 屬於 article，也未驗證 word 在段落中 | 改語境／權限驗證時注意此資料完整性缺口；文章 regenerate 路由已有歸屬檢查 |
| 文章清單一次全量取回，篩選／後台分頁在前端 | 未提供後端文章搜尋／分頁；資料量增長時需一起考慮 API 與 UI |
| 文章 job 有 stale 回收但沒有圖片 job 那種 lease 續期／token 驗證 | 超長工作與多 worker 情境不可假設完全防止重複外部呼叫；批次翻譯亦未加文章級生成鎖 |
| 文章 worker heartbeat 在整輪 drain 結束後才寫入 | 長時間處理可能超過 Docker 的 30 秒 heartbeat 門檻；健康燈不等同處理結果 |
| 音檔寫入與 DB transaction 分離、清理 best-effort | 失敗可能留下檔案；不要把資料交易當成檔案系統原子交易 |
| 圖片有預算保留／估算／unknown billing | `actual` 為依 usage／設定計算的值，不是完整帳單同步；unknown 不應當零元或自動重送 |
| 已發布圖片讀取沒有每次重比來源 hash | metadata 變更會影響新 run／發布的來源驗證，但既有圖片不會因此自動撤下 |
| 已有收藏與熟悉狀態，但沒有閱讀進度、測驗自動評分、SRS、多人班級或付費訂閱模型 | 快速挑戰為自行判斷；產品目前以單一使用者為前提 |

## 13. 未來 agent 的任務定位與文件維護

啟動時先讀第 1–3 節；接著依下表定位，再閱讀對應流程、測試與當下程式。不要把歷史需求檔當成已實作功能，也不必每次重新掃描全庫。

| 使用者提到的任務 | 優先閱讀 |
| --- | --- |
| 清單、閱讀、翻譯顯示、分享 | `web-learner/src/App.tsx`、`lib/`，必要時 `api/src/routes/articles.ts` |
| 朗讀、跳段、速度、疊音 | `web-learner/src/useArticlePlayer.ts`、`AudioBar.tsx`、`lib/audioBus.ts` |
| 點字、片語、來源解釋、已解釋標記 | learner `WordPopup`／`ClickableText`、`api/src/routes/lookups.ts`、`shared/src/repo/wordExplanations.ts`、`normalizeWord.ts`／`tokenizeWords.ts` |
| 收藏、複習、熟悉狀態、日期／來源篩選 | learner `VocabularyReview.tsx`／`lib/vocabulary.ts`／`vocabularyTypes.ts`、App `WordPopup`、`lib/route.ts`、API／repo `vocabulary.ts`、收藏 migration 與相關測試 |
| 翻譯品質／TTS 失敗或重試 | `worker/src/processor.ts`、`shared/src/repo/jobs.ts`、`shared/src/llm/`、音訊工具 |
| 生成供應商、模型、聲線設定或 Google Vertex AI 端點 | admin `GenerationSettings.tsx`、API `generationSettings.ts`、`shared/src/{generationSettings,generationClients}.ts`、`shared/src/llm/{auth,genai}.ts`、repo、migration、API／worker 入口 |
| 缺失單字音檔清單／逐檔或全部補檔 | admin `App.tsx`／`AudioBackfillPanel.tsx`、`api/src/routes/lookups.ts`、`shared/src/repo/audioBackfill.ts`、相關測試 |
| 文章上傳、分類、標籤 | admin `App.tsx`／`lib/meta.ts`、API articles／taxonomy、相關 repo |
| 角色、登入、403 | `api/src/auth.ts`、users routes／repo、`shared/src/config.ts` |
| 圖片規劃／生成／費用 | `shared/src/illustrations/{contracts,plan-schema,catalog,providers,processor}.ts`、config JSON、`worker/src/image-index.ts` |
| 圖片審核、版本、發布、權限、刪除 | admin `Illustrations.tsx`、API illustrations、`shared/src/illustrations/{repository,storage,processor}.ts`、圖片 migration |
| 部署後 API 404／502 或前後台連結 | proxy、兩前端 nginx／Vite、兩前端 api／urls、Docker build args、`routeConfig.test.ts` |
| Schema／資料一致性 | migrations、repo、路由 validator、前後台 types、相關 DB tests |

需要更新本文的時機：新增／移除使用者功能，改變角色權限、API 契約、job 狀態／重試、核心 DB 關係、生成供應商、部署拓撲或測試方式。請在同次修改更新相應節與分析基準；純視覺樣式調整通常不必改整份導覽。

本文的目的，是讓下一次對話能先判斷「要改哪個流程、牽涉哪些層、哪些現有行為需保留」，再深入具體程式，而不是取代閱讀當下實作。
