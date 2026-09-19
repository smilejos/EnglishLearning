# 文章 AI 插圖回補、封面生成與模型切換 — 需求與設計文件

- 日期：2026-09-05
- 狀態：待確認（需求草案完成；第 23 節決策確認後再拆實作計畫）
- 範圍：既有與新文章的全文視覺規劃、逐段插圖、AI 封面、模型切換、版本重生、審核發布、成本與圖片資產生命週期
- 不含：家長陪讀卡、人力開發成本估算
- 前置文件：design-english-learning-platform-2026-06-29.md、design-improvements-2026-07-04.md

> 本文為可討論的需求基線。第 4 節是使用者已明確確認的決策；正文其餘流程暫以第 23 節右欄「建議預設」撰寫，在 Q1–Q7 尚未確認前仍屬提案，不視為最終產品決策。

---

## 1. 背景

目前平台的文章已拆成固定順序的段落，並提供逐段翻譯、英文／中文朗讀與單字解釋，但閱讀頁沒有與課文內容對應的圖片。文章封面則由前端依分類與文章 ID 固定計算 emoji 和漸層，不是文章內容的視覺摘要。

本功能希望在不改動原文、翻譯與語音的前提下，替既有或新文章事後產生：

1. 一張能代表全文主題的 AI 封面。
2. 每個適合的段落一張情境插圖。
3. 與插圖物件對應的教學單字標示。
4. 可預覽、重新產生、核准與切換的完整視覺版本。

產生圖片屬有費用的管理操作；所有費用估算只計外部 API，不計人力開發成本。

## 2. 目標與成功標準

### 2.1 產品目標

- 利用圖片幫助兒童快速建立英文段落、具體物件與動作之間的聯想。
- 產圖前先理解全文，讓封面、角色、場景、畫風與色票保持一致。
- 管理者可在每次產生或重新產生時選擇圖片模型。
- 同一篇文章可以反覆重新產生，不破壞目前已發布的視覺版本。
- 同一供應商且相容既有 adapter 的新模型可透過設定檔加入，不必修改管理端或資料庫 schema。
- 圖片處理中或失敗時，原本的純文字、翻譯與語音閱讀仍可正常使用。

### 2.2 成功標準

- 管理者能替任一既有完成文章建立「封面 1 張＋段落插圖」的視覺版本。
- 建立工作前能看到張數、模型、估算費用與設定的最高預算。
- 管理端只能選擇設定檔中已啟用且伺服器有憑證的模型。
- 新版圖片未發布前，學習者持續看到舊版圖片；沒有舊版時使用現有純文字與 emoji／漸層 fallback。
- 發布時一次切換整套視覺版本，不出現半套新圖、半套舊圖。
- 每次 API 嘗試都能追蹤模型、Prompt、結果、錯誤與費用。
- 自動測試不呼叫任何真實生圖、LLM 或 TTS API。

## 3. 名詞

| 名詞 | 定義 |
|------|------|
| Visual Run | 一次針對某篇文章執行的完整視覺規劃與生圖版本，也稱 revision |
| Visual Plan | 由全文產生的結構化規劃，包含畫風、角色、封面 brief、逐段 scene brief 與教學單字 |
| Slot | 一個應有圖片的位置；類型為 cover、paragraph 或 reference |
| Candidate | 某個 Slot 的一次生成結果；重新生成會增加 Candidate，不覆蓋舊檔 |
| Published Run | 目前提供給學習者的正式視覺版本 |
| Model ID | 管理端使用的穩定識別碼，例如 openai-gpt-image-2 |
| API Model | 實際傳給供應商的模型名稱或 snapshot，可能隨設定更新 |
| Teaching Target | 適合在圖片上標示、幫助理解段落的英文單字與視覺物件對應 |

## 4. 已確認的產品決策

1. 圖片採「全文規劃後逐段生成」，不是每段獨立盲生。
2. 首批圖片模型為 OpenAI GPT Image 2 與 Google Gemini 3.1 Flash Lite Image。
3. 每次建立或重新建立 Visual Run 時，管理者可選擇使用哪一個模型。
4. 圖片模型來自伺服器端設定檔，管理端不硬編模型清單；新模型仍須相容已存在的 provider adapter。
5. 每篇文章可以重新產生完整視覺版本，並可改選另一個模型。
6. 封面與段落圖屬於同一次全文 Visual Plan，共用畫風、角色與色票。
7. 既有文章可以事後回補，不重新翻譯、不重新產生 TTS，也不改動原文。
8. 圖片狀態與現有文章／段落處理狀態完全分離。
9. 家長陪讀卡不納入本次需求。
10. 成本只估算外部 API 費用，不估人力成本。

## 5. 現況與相容性基礎

### 5.1 有利條件

- paragraphs 已有穩定的 id、article_id、idx 與英文 text；同篇文章的 article_id＋idx 唯一，可依順序重建全文：migrations/1782740846925_init-schema.sql。
- API 固定依 idx 取得段落：shared/src/repo/paragraphs.ts。
- 文章 metadata 編輯不修改段落正文：api/src/routes/articles.ts。
- 學習者頁已逐段 map 渲染，適合在段落附近條件式加入 figure：web-learner/src/App.tsx。
- 管理端文章詳情目前每三秒輪詢，可沿用來顯示生圖進度：web-admin/src/App.tsx。

### 5.2 必須隔離的既有機制

- 現有 articles.status、paragraphs.status 與 jobs 專用於翻譯＋TTS。
- 學習者清單只顯示 article.status 為 done 的文章：web-learner/src/lib/articles.ts。
- 現有 worker 認領 job 後固定執行翻譯與雙語 TTS：worker/src/processor.ts。

因此圖片工作不得重用現有狀態或直接塞進既有 jobs；否則可能讓正在補圖的文章從學習者清單消失，或被語音 worker 錯誤處理。

### 5.3 現有封面與儲存

- 現有封面是 web-learner/src/lib/cover.ts 產生的 deterministic emoji＋CSS 漸層。
- 封面使用於文章卡片、閱讀頁 Hero 與底部播放器，三處尺寸不同。
- API 目前只提供 /audio/ 靜態服務；Compose、備份與刪除流程也只處理 audio。

本功能必須保留現有封面為向後相容與錯誤 fallback，並補齊圖片 volume、靜態服務、縮圖、備份、還原與刪除生命週期。

## 6. 使用角色與主要情境

### 6.1 管理者

- 替沒有圖片的既有文章回補完整圖文。
- 選擇 OpenAI 或 Google 模型後查看預估費用並開始生成。
- 查看規劃、封面、逐段圖片、教學單字、進度與錯誤。
- 對不理想的完整版本或單張圖片重新生成。
- 在新版完整且核准後發布；生成期間不影響孩子正在看的版本。
- 日後在設定檔新增同供應商的新模型。

### 6.2 學習者

- 在文章清單與閱讀頁看到與文章內容相符的封面。
- 在段落附近看到幫助理解的情境圖片。
- 在圖片上看到少量、正確且可點擊的英文單字標示。
- 圖片不存在、載入失敗或尚未核准時仍可閱讀文字與使用語音。

## 7. 範圍與非目標

### 7.1 本次範圍

- 單篇文章手動建立與重新建立 Visual Run。
- 動態模型清單與兩個 provider adapter。
- 全文 Visual Plan、封面與逐段插圖。
- 預估費用、預算上限、進度、失敗、取消與重試。
- 管理端預覽、核准與發布。
- 學習者端 AI 封面、段落圖與 fallback。
- 圖片版本、資產、備份與刪除。
- 結構化教學單字與 overlay 能力。

### 7.2 非目標

- 家長陪讀卡。
- 依個別孩子程度產生不同圖片或個人化單字。
- 由 AI 修改文章原文、段落順序、翻譯或音訊。
- 在學習者前台直接觸發付費生圖。
- 以設定檔支援任意未知供應商；全新供應商仍需 adapter 程式碼。
- 精準對帳供應商最終帳單；系統保存的 usage／費用以供應商回傳或設定檔估算為準。
- 第一版一次批次回補全站所有文章。

### 7.3 建議交付邊界

為避免第一版同時承擔過多操作面，建議分成：

Phase 1（核心可用）：

- Model／pricing catalog、OpenAI／Gemini adapters 與獨立 image-worker。
- 有期限 estimate quote、預算保留、attempt ledger 與取消。
- 單篇 scope=all：全文 Visual Plan、封面、逐段圖、人工核准、原子發布。
- 以同一或不同模型完整重新產生一篇文章。
- 本機 images volume、縮圖、驗證、備份、刪除與 learner fallback。
- 保存 Teaching Targets；若 Q3 決定第一版顯示 overlay，先支援人工確認座標。

Phase 2（品質與效率）：

- missing、cover-only、指定段落等 parent 繼承式增量重生。
- Reference sheet 停等核准、自動 vision anchor、OCR／語意 QA。
- 多 Candidate 比較與更完整的拖曳編輯。
- Provider Batch API、全站批次回補、pause／resume、style preset。
- R2／S3 storage adapter 與進階清理策略。

資料模型從 Phase 1 即保留 revision、Candidate、Asset 與 Attempt 分層，避免 Phase 2 再進行破壞式 migration；管理 UI 和 worker 行為則按階段開放。

## 8. 完整使用流程

~~~text
管理者打開既有文章
  → 進入「圖片」區
  → 選擇模型、產生範圍與預算上限
  → 系統計算預估張數與費用
  → 管理者確認
  → 建立 immutable Visual Run revision N
  → 全文 Planner 產生結構化 Visual Plan
  → 建立 reference / cover / paragraph slots
  → 有固定角色時可先生成並核准 reference sheet（待 Q4）
  → image-worker 依選定模型逐張生成
  → 管理端顯示進度、圖片與失敗原因
  → 管理者核准必要圖片
  → 發布 revision N
  → 學習者一次切換到新封面與段落圖
~~~

重新產生時建立 revision N+1。Revision N 在 N+1 生成、失敗或審核期間持續對外服務。

## 9. 模型設定檔

### 9.1 設定來源

新增非敏感、可提交版本控制的 config/image-models.json。既有 loadConfig() 只負責 catalog path 與服務本身需要的 secrets；另由 loadImageModelCatalog() 讀取檔案並做 Zod 驗證。API 驗證結構與可選模型，image-worker 另外驗證實際需要的 provider 憑證。

若需求是「改設定檔後只重啟即可生效」，Compose 必須把 image-models.json 與 image-pricing.json 以 read-only bind mount 同時掛入 API 與 image-worker，而不是只 baked into container image。API 建立 Run 時保存完整 config snapshot；worker 執行既有 Run 時使用該 snapshot，不因兩個服務短暫載入不同 catalog 版本而換模型。

建議環境變數：

~~~dotenv
IMAGE_DIR=/data/images
IMAGE_MODELS_FILE=/app/config/image-models.json
IMAGE_PRICING_FILE=/app/config/image-pricing.json

# 僅注入 image-worker；正式環境亦可改用 secret file
OPENAI_API_KEY=
OPENAI_API_KEY_FILE=/run/secrets/openai_api_key
~~~

Google 圖片 adapter 沿用 server-side GEMINI_API_KEY 或 GOOGLE_APPLICATION_CREDENTIALS。模型與價格 JSON 不得保存任何金鑰。

~~~json
{
  "schemaVersion": 1,
  "defaultModelId": "openai-gpt-image-2",
  "models": [
    {
      "id": "openai-gpt-image-2",
      "label": "OpenAI GPT Image 2",
      "provider": "openai",
      "adapter": "openai-images-v1",
      "apiModel": "gpt-image-2-2026-04-21",
      "enabled": true,
      "pricingProfileId": "openai-gpt-image-2-medium",
      "profiles": {
        "cover": {
          "deliveryAspectRatio": "16:9",
          "providerOptions": { "size": "1536x1024", "quality": "medium" }
        },
        "paragraph": {
          "deliveryAspectRatio": "4:3",
          "providerOptions": { "size": "1536x1024", "quality": "medium" }
        }
      }
    },
    {
      "id": "google-gemini-3-1-flash-lite-image",
      "label": "Google Gemini 3.1 Flash Lite Image",
      "provider": "google-gemini",
      "adapter": "gemini-generate-content-v1beta",
      "apiModel": "gemini-3.1-flash-lite-image",
      "enabled": true,
      "pricingProfileId": "google-gemini-3-1-flash-lite-image-1k",
      "profiles": {
        "cover": {
          "deliveryAspectRatio": "16:9",
          "providerOptions": { "aspectRatio": "16:9", "imageSize": "1K" }
        },
        "paragraph": {
          "deliveryAspectRatio": "4:3",
          "providerOptions": { "aspectRatio": "4:3", "imageSize": "1K" }
        }
      }
    }
  ]
}
~~~

deliveryAspectRatio 是前端最後顯示與本地裁切的共同意圖；providerOptions 則必須是該 adapter 可驗證、可確定計價的實際上游參數。不得只靠模糊的 aspect ratio 推測上游尺寸與價格。OpenAI 的 native landscape 輸出可再依 focal point 本地裁成 16:9／4:3。

### 9.2 設定要求

- id 是 UI、API 與歷史資料使用的穩定鍵，不等於上游模型名稱。
- apiModel 可以使用 alias 或固定 snapshot。
- enabled=false 的模型不出現在可選清單，但歷史 Visual Run 仍能顯示。
- 同一 provider 且仍相容既有 adapter 的 API family、輸入輸出與 options schema 時，只需新增合法 catalog entry 並重啟 API／image-worker；供應商若推出不相容的新 API，仍需新 adapter。
- 新增全新 provider 時，必須實作並註冊新的 adapter。
- 設定更新只影響更新後新建的 Visual Run，不改變排隊中或歷史版本。
- 價格資料透過獨立 config/image-pricing.json 與 pricingProfileId 管理，包含幣別、計價公式、各項單價、sourceUrl、effectiveAt 與 lastVerifiedAt，避免價格更新污染模型能力設定。

### 9.3 啟動驗證

啟動時至少驗證：

- schemaVersion 受支援。
- Model ID 不重複。
- defaultModelId 存在且啟用。
- 每個 provider 都有已註冊 adapter。
- 每個 pricingProfileId 都能解析，且計價方式符合 adapter 回傳的 usage。
- cover／paragraph profile 符合該 provider 能力。
- Gemini 3.1 Flash Lite Image 的 imageSize 必須是目前官方支援的 1K。
- image-worker 對所有啟用 provider 都有可用憑證。
- 前端傳入的 Model ID 必須存在且啟用；不可接受任意 endpoint、API Model 或 provider options。

### 9.4 Pricing profile

config/image-pricing.json 使用 versioned discriminated union，至少支援：

- per-image：依精確 native size、quality 與操作類型查表。
- token-based：分 image／text input、cached input、output token 單價。
- hybrid：固定圖片輸出費加 input／thinking usage。

每個 profile 必須包含 id、provider、adapter、currency、billingModel、rates、sourceUrl、effectiveAt 與 lastVerifiedAt。若選定的 providerOptions 找不到精確 rate，估價端點必須拒絕建立 quote，不可猜測或默認為零。價格變更建立新 profile 或新版本，舊 Run 永遠保存建立當下的完整快照。

## 10. Provider Adapter

圖片 worker 只依賴共同介面，不直接包含 OpenAI／Google 分支流程：

~~~ts
type ImagePurpose = "cover" | "paragraph" | "reference";

interface ImageGenerationRequest {
  purpose: ImagePurpose;
  prompt: string;
  references: Array<{ bytes: Buffer; mimeType: string }>;
  idempotencyKey: string;
  signal?: AbortSignal;
}

interface GeneratedImage {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width?: number;
  height?: number;
  providerRequestId?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface ImageProviderAdapter {
  readonly provider: string;
  generate(
    model: ResolvedImageModel,
    request: ImageGenerationRequest
  ): Promise<GeneratedImage>;
}
~~~

首批 adapter 為 OpenAIImageAdapter 與 GeminiImageAdapter。

如果使用者選擇的 provider 失敗，系統不得未經同意自動改用另一家；這會改變畫風、成本與資料傳送對象。管理者可在失敗後主動用另一模型建立新版本。

## 11. 全文 Visual Plan 與 Prompt 品質契約

### 11.1 Planner 輸入

- 文章 ID、標題、分類、年級、程度與標籤。
- 所有段落的穩定 paragraphId、idx 與英文原文。
- 專案級兒童插畫規則與禁止事項。
- 選定圖片模型的能力與限制。
- Prompt template 版本。

### 11.2 Planner 結構化輸出

Planner 必須輸出並通過 schema 驗證的 JSON，而不是一段自由文字：

~~~ts
interface SceneBrief {
  learningGoal: string;
  subject: string;
  action: string;
  setting: string;
  composition: string;
  continuityNotes: string[];
}

interface PlannedTeachingTarget {
  word: string;
  normalizedWord: string;
  reason: string;
  visualObject: string;
}

interface ArticleVisualPlan {
  articleSummary: string;
  audience: {
    ageBand: string | null;
    englishLevel: string | null;
  };
  styleBible: {
    medium: string;
    palette: string[];
    lighting: string;
    compositionRules: string[];
    forbiddenElements: string[];
  };
  characterBible: Array<{
    id: string;
    name: string;
    visualDescription: string;
    clothing: string;
    continuityRules: string[];
  }>;
  coverBrief: SceneBrief;
  paragraphs: Array<{
    paragraphId: number;
    idx: number;
    required: boolean;
    skipReason: string | null;
    scene: SceneBrief | null;
    teachingTargets: PlannedTeachingTarget[];
  }>;
}
~~~

Planner 回傳的 paragraph ID 集合必須與本次來源完全相符，不可遺漏、重複或自行新增段落。Schema 不合法時可重試 Planner；仍失敗則 Visual Run 標記失敗，不建立付費圖片工作。

### 11.3 Prompt 組裝

每張圖的最終 Prompt 由程式按固定順序組裝：

1. 兒童安全與輸出格式規則。
2. 專案級 house style。
3. 本篇 style／character bible。
4. 該 Slot 的場景、構圖、視角、人物動作與必要物件。
5. 與前後段的連貫要求。
6. 教學單字對應物件，但要求模型不要自行拼寫關鍵文字。
7. Provider／模型特有限制、尺寸與禁止事項。

所有 Visual Plan、組裝後 Prompt、negative constraints、template version、provider、API Model 與設定快照都要保存。這能讓品質問題可重現，也能比較兩個模型的實際採用率與平均重試次數。

### 11.4 來源變更偵測

Visual Run 建立時保存 sourceHash，至少涵蓋：

- 文章標題。
- 依序排列的 paragraph ID 與英文原文。
- 影響視覺的年級、程度或分類設定。

發布前再次計算；若不相符，禁止直接發布並提示重新規劃。標題變更至少使封面標記 stale。

## 12. 封面需求

- 封面是 Visual Run 的必要 Slot，kind=cover 且沒有 paragraph ID。
- 封面 brief 根據全文主題與情緒產生，不直接拿第一段 Prompt 代替。
- 封面與逐段圖使用同一個選定模型、style bible、character bible 與色票。
- 預設生成一張 landscape master；建議共通意圖為 16:9。
- 構圖必須保留中央安全區，並保存 focalX／focalY 供不同版位裁切。
- 文章卡片、閱讀頁 Hero 與播放器縮圖都由同一 master 在本地產生衍生圖，不額外呼叫生圖 API。
- 標題預設由 HTML 顯示，不燒進圖片，避免拼字錯誤與響應式裁切。
- 沒有 published cover 或圖片載入失敗時，使用現有 coverFor() emoji／漸層。

## 13. 段落圖片與教學單字

### 13.1 段落圖片

- 每個段落建立一個 Slot；是否允許 Planner 判定 required=false 見第 23 節。
- 建議共通長寬比為 4:3，實際尺寸由 provider profile 決定。
- 圖片要表達段落中的核心情境，不需要逐字把所有細節塞進同一畫面。
- Planner 先產生 altText 草稿；管理者可修改，vision QA 可做輔助檢查。發布 gate 要求非空且經審核，不能只做長度檢查。
- 圖片不可遮擋段落播放、翻譯或點字操作。
- 學習者端使用 lazy loading、async decoding 與固定 aspect ratio；載入失敗時隱藏圖片並保留正文。

### 13.2 單字選擇規則

每段建議選擇 0–3 個 Teaching Targets，優先順序如下：

1. 確實出現在該段英文原文。
2. 是理解段落情境必要的具體名詞、動作動詞或可視覺化形容詞。
3. 適合文章標示的年級／程度。
4. 能明確對應圖片中的單一物件、人物、動作或特徵。
5. 避免同篇不必要地重複標示同一個字。

應排除：冠詞、介系詞等功能詞、無法可靠視覺化的抽象詞、未出現在原文的同義改寫、可能造成錯誤聯想或需要長篇解釋的詞。

### 13.3 Overlay 而非關鍵文字烙圖

教學單字在視覺上可以直接出現在圖片上，但技術上預設由 HTML／SVG 疊加，不讓模型把關鍵拼字畫進像素。全文 Planner 只決定單字與對應物件；圖片生成後才根據實際像素定位：

~~~ts
interface PositionedTeachingTarget {
  word: string;
  normalizedWord: string;
  reason: string;
  visualObject: string;
  anchor: { x: number; y: number };
  confidence: number;
  placementSource: "vision" | "manual";
}
~~~

座標使用 0–1 正規化值。自動定位可由額外 vision call 產生建議座標，再由管理者拖曳修正；若不使用 vision call，則由管理者放置。這項選擇會影響費用與管理 UI，見 Q7。Overlay 必須：

- 拼字取自原文 token，不相信模型自行拼寫。
- 支援點擊發音與既有單字解釋。
- 可依螢幕尺寸調整位置，必要時避免標籤重疊。
- 支援顯示／隱藏，並具足夠對比與鍵盤操作能力。
- 圖片裁切時依 focal point／實際顯示框重新計算位置。

裝飾性招牌等非教學文字可以存在圖片內；若其內容重要，必須另做 OCR／人工檢查，且檢查 API 成本要列入估價。

## 14. 重新產生、Candidate 與發布

### 14.1 Immutable revision

- POST /articles/:id/illustration-runs 永遠建立 revision N+1。
- 不覆寫已發布 Visual Run、Candidate 或圖片檔。
- 每次 Run 保存當時的 Model ID、provider、API Model、模型設定、價格設定、Prompt version 與來源 hash 快照。
- 管理者重新產生時可沿用同一模型或選擇另一模型。
- 新 Run 的 parent_run_id 預設指向目前 published Run；第一次生圖時可為 NULL。
- 建立 N+1 時先具體建立完整 cover／paragraph Slot 集合。Scope 只決定哪些 Slot 呼叫 API 生成；未選中的 Slot 從 parent Run 建立 inherited Candidate，引用相同 immutable asset，不產生 API 費用。
- 因此 cover-only、missing 或單段重生仍是一套可獨立完整發布的 Visual Run，不會缺少其他段落圖片。
- Published Run 完全唯讀。使用者在已發布圖片上按「重新生成」時，UI 必須建立 N+1；不得直接替 published Slot 新增或改選 Candidate。
- 第一次生圖沒有 parent Run 時只允許 scope=all；cover-only、missing 或 paragraphs request 回 409。Parent 的 source hash 不相符時也禁止繼承，只能重新執行 all。
- scope=all 可以選擇不同模型並重新建立 Visual Plan；增量 scope 必須鎖定與 parent 相同的 Model ID、API Model、style／character bible。若要換模型，必須完整重生，避免同一 Run 混搭模型與畫風。

### 14.2 Candidate

- 同一 Slot 可有多個 Candidate。
- 單張重新生成會新增 Candidate，不刪除目前選定圖片。
- Candidate 可透過 derived_from_candidate_id 表示從 parent Run 繼承；繼承項引用相同 asset，不複製實體圖片。
- 管理者可選擇 Candidate、核准或拒絕。
- 失敗 Candidate 保存 attempts、provider request ID、可安全顯示的錯誤與成本。

### 14.3 發布

- Draft／Review Run 不出現在學習者 API。
- 發布前驗證 source hash、必要 Slot、已選 Candidate 與核准狀態。
- 發布使用單一資料庫 transaction 切換 published_visual_run_id。
- 新版發布成功後才取代舊版；舊資產依保留策略處理。
- 預設不得部分發布；選項見第 23 節。

人工核准 checklist：

- 圖片主旨符合該段／全文，沒有關鍵事實矛盾。
- 同一角色的外觀、服裝、相對年齡與主要色票一致。
- 必要人物、物件或動作確實可見，沒有不合理肢體或數量。
- 每個 Teaching Target 對應物件確實存在，anchor 沒有指錯位置。
- 沒有非預期、拼錯或不適齡文字。
- 圖片符合兒童安全規則，alt text 正確且不洩漏不必要內容。

若採用 Q4 的 reference sheet gate，Run 在 planning 後進入 waiting_reference_review；reference 未核准前不得排送 cover／paragraph generate jobs。

## 15. 管理端功能需求

文章詳情新增「圖片」區：

| 功能 | 行為 |
|------|------|
| 模型下拉 | 從 API 動態取得啟用模型；顯示供應商、解析度／品質與價格資料日期 |
| 產生範圍 | 完整文章、只補缺圖、只封面、指定段落；第一版範圍見第 23 節 |
| 費用預覽 | 顯示 Planner、參考圖、封面、段落圖、重試預留與最高費用 |
| 開始產生 | 二次確認後建立背景工作，立即回傳 Run ID |
| 進度 | 顯示 planning、已完成／總圖片數、目前成本、失敗數與預估剩餘 |
| 取消 | 停止尚未送出的工作；已送到 provider 的呼叫可能仍會計費。暫停／繼續列為後續功能 |
| 重試 | 只重試失敗／缺少項目，或建立完整新版本 |
| 預覽 | 依閱讀順序顯示封面、各段原文、圖片、單字標記與 Prompt 摘要 |
| 核准／拒絕 | 針對 Candidate 操作，拒絕時可填簡短原因供下一次 Prompt 使用 |
| 發布 | 通過完整性檢查後原子切換正式版本 |
| 歷史 | 顯示 revision、模型、建立時間、狀態、成本與目前 published 標示 |

所有建立、取消、重試、核准、拒絕與發布操作都限 admin，並記錄操作者與時間。

## 16. 學習者前台需求

### 16.1 Article DTO

文章清單與詳情可以增加 nullable 欄位：

~~~ts
interface PublishedCover {
  url: string;
  thumbnailUrl: string;
  altText: string;
  focalX: number;
  focalY: number;
  revision: number;
}

interface Article {
  // existing fields
  cover: PublishedCover | null;
}
~~~

### 16.2 Paragraph DTO

~~~ts
interface PublishedIllustration {
  id: number;
  url: string;
  altText: string;
  width: number;
  height: number;
  revision: number;
  teachingTargets: PositionedTeachingTarget[];
}

interface Paragraph {
  // existing fields
  illustration: PublishedIllustration | null;
}
~~~

### 16.3 顯示行為

- 只有 published Run 的圖片可以由 learner API 回傳。
- cover=null 時繼續使用現有 emoji／漸層。
- illustration=null、載入失敗或圖片服務不可用時，段落仍按目前純文字方式顯示。
- 段落圖片建議放在段落正文前的獨立 figure，避免高圖片讓自動朗讀捲動後看不到文字。
- 正文、翻譯、播放按鈕、點字與 AudioBar 行為不得回歸。
- 圖片與 overlay 需要響應式、鍵盤可操作、合理 alt text 與足夠對比。

## 17. 資料模型

### 17.1 article_visual_runs

一篇文章一次完整視覺版本：

- id、article_id、revision、parent_run_id、estimate_id。
- request_idempotency_key；以適當的 admin／article scope 建立唯一約束。
- source_hash、status。
- model_id、provider、api_model。
- model_config_snapshot、pricing_profile_snapshot。
- prompt_template_version、planner_provider、planner_model、plan_json。
- estimated_cost_usd_micros、reserved_cost_usd_micros、actual_cost_usd_micros、max_cost_usd_micros。
- created_by、created_at、updated_at、completed_at。

同篇 revision 唯一；article_id 外鍵使用 ON DELETE CASCADE。

### 17.2 illustration_slots

- id、run_id。
- kind：cover、paragraph 或 reference。
- paragraph_id；cover／reference 時為 NULL。
- required、skip_reason、selected_candidate_id、created_at。

資料庫約束：

- kind=paragraph 時 paragraph_id 必須存在；cover／reference 時必須為 NULL。
- partial unique index 保證每個 Run 最多一個 cover Slot。
- unique (run_id, paragraph_id) 保證每段最多一個 paragraph Slot。
- selected_candidate_id 必須屬於同一 Slot，可用包含 slot_id 的 composite FK 或 transaction 中的 constraint trigger 保證。

### 17.3 illustration_candidates

- id、slot_id、candidate_no、status。
- derived_from_candidate_id；繼承 parent Run 圖片時使用。
- prompt_json、model_snapshot。
- asset_id；失敗或尚未完成時為 NULL。
- focal_x、focal_y、alt_text。
- teaching_targets、latest_error。
- reviewed_by、reviewed_at、review_reason、created_at。

Candidate 表示一次使用者要求的候選意圖與最終結果；同一 Candidate 的自動 retry 全部寫入 illustration_attempts。Provider request ID、usage 與單次費用以 attempt ledger 為準，Candidate 如需顯示總成本則查詢彙總，避免 retry 覆蓋資料。

### 17.4 illustration_assets 與 illustration_asset_files

illustration_assets 代表可被不同 revision 引用的 immutable 圖片：

- id、sha256、created_at。
- 不保存文章標題或可變動路徑。

illustration_asset_files 保存 master 與所有衍生檔：

- id、asset_id。
- variant：master、web、cover-card、cover-hero、cover-player。
- object_key、mime_type、width、height、byte_size。
- unique (asset_id, variant)。

Candidate 透過 asset_id 引用圖片；從 parent Run 繼承時只新增 Candidate／Slot 關係，不複製檔案。

### 17.5 illustration_attempts

每次可能觸發供應商費用的送出紀錄，涵蓋 Planner、reference、image generation、vision 定位、OCR 與自動 QA：

- id、run_id、job_id、candidate_id；candidate_id 在 Planner 等前置操作可為 NULL。
- operation_kind、provider、api_model、request_fingerprint、prompt_fingerprint。
- state：reserved、sending、succeeded、failed、uncertain。
- provider_request_id。
- estimated_cost_usd_micros、reserved_cost_usd_micros。
- billing_status：estimated、actual、not_charged、unknown。
- actual_cost_usd_micros、usage_json、error。
- started_at、finished_at。

worker 在送出前先建立 reserved attempt。若請求已送出但 worker 在取得或保存結果前中斷，attempt 必須是 uncertain；除非 adapter 支援可查詢結果或供應商保證強 idempotency，否則不得自動重送。

### 17.6 illustration_jobs

- id、kind；kind 為 plan、generate、derive 或 qa。
- run_id、slot_id、candidate_id。
- status、attempts、available_at、idempotency_key、error。
- created_at、updated_at。

圖片 queue 與現有翻譯／TTS jobs 分離，並由獨立 image-worker 處理。

### 17.7 illustration_estimates

保存管理者確認的短效 quote：

- id，使用不可猜測 UUID。
- article_id、source_hash、model_id。
- model_config_hash、pricing_config_hash。
- scope_json、asset_counts_json。
- base_cost_usd_micros、reserved_retry_cost_usd_micros、max_cost_usd_micros。
- created_by、created_at、expires_at、consumed_at、consumed_by_run_id。

建立 Run 必須帶 estimateId。Server 驗證 quote 未過期、未使用，且文章來源、模型、設定、價格與 scope 都未變更；成功建立後在同一 transaction 標記 consumed。若相同 idempotency key 因網路重送再次抵達，回傳第一次建立的 Run，不因 quote 已 consumed 而建立第二份或錯誤扣款。

### 17.8 Published pointer

articles 增加 nullable published_visual_run_id，或以獨立 publication table 保存同等關係。舊文章為 NULL，不需要資料回填；API 使用 LEFT JOIN，自然回傳 cover=null 與 illustration=null。

published_visual_run_id 必須指向同一 article 的 Run；可用複合 FK (article_id, published_visual_run_id) 保證。當 N+1 發布後，原 Run 狀態改為 superseded，但其資產仍依保留策略存在。

### 17.9 illustration_audit_events

保存 create、cancel、retry、candidate review、publish、delete 等管理操作：

- id、run_id、slot_id、candidate_id；依事件可為 NULL。
- event_kind、actor_user_id、reason、metadata_json。
- created_at。

Audit event 不保存 API key 或完整敏感上游回應。拒絕 Candidate 的原因同時保存在 Candidate review_reason，方便下一次 Prompt 使用。

## 18. API 契約

### 18.1 管理端模型與估價

~~~http
GET /image-models
POST /articles/:id/illustration-estimates
~~~

估價與建立 Run 共用同一個 GenerationScope schema：

~~~ts
type GenerationScope =
  | { kind: "all" }
  | { kind: "missing" }
  | { kind: "cover" }
  | { kind: "paragraphs"; paragraphIds: number[] };
~~~

paragraphIds 只允許出現在 kind=paragraphs，且必須屬於 URL 指定文章。估價 request：

~~~json
{
  "modelId": "openai-gpt-image-2",
  "scope": { "kind": "all" }
}
~~~

估價 response 至少包含：

- 有期限且只能使用一次的 estimateId 與 expiresAt。
- 模型與價格設定快照摘要。
- Planner 呼叫次數。
- 封面、段落圖與參考圖張數。
- 預估重試預留。
- 估算金額或區間。
- 價格資料日期。
- 估算不保證等於供應商帳單的提示。

### 18.2 建立與管理 Run

~~~http
POST /articles/:id/illustration-runs
GET  /articles/:id/illustration-runs
GET  /articles/:id/illustration-runs/:runId
POST /articles/:id/illustration-runs/:runId/cancel
POST /articles/:id/illustration-runs/:runId/publish
POST /articles/:id/illustration-runs/:runId/slots/:slotId/regenerate
POST /articles/:id/illustration-runs/:runId/candidates/:candidateId/review
DELETE /articles/:id/illustration-runs/:runId
~~~

Slot regenerate 只允許作用於未發布 Run。若 UI 從 published 圖片發起重生，必須先透過估價／建立流程 fork N+1，再在新 Run 生成指定 Scope。

DELETE 只允許刪除非目前 published 的 draft、failed、cancelled 或 superseded Run；刪除共享 asset 時仍必須遵守引用計數與 cleanup job 規則。

建立 request：

~~~json
{
  "estimateId": "server-issued-quote-uuid",
  "idempotencyKey": "client-generated-uuid"
}
~~~

Server 從 estimateId 取回已確認的 model、scope、來源 hash 與最高預算；不得接受 request 偷換參數。scope=all 一律包含封面；增量 scope 則從 parent 繼承未重生的封面。建立成功回 202 Accepted，包含 Run ID、revision、模型、排程範圍、估算費用與狀態。所有寫入端點必須套用現有 admin 權限守衛。

### 18.3 學習者既有 API

- GET /articles 增加 published cover 或 null，必須避免每篇再查一次造成 N+1 query。
- GET /articles/:id 增加 published cover 或 null，並替每段增加 illustration 或 null。
- Draft、Review、Failed Candidate、Prompt、費用與 provider 錯誤不得出現在 learner response。
- web-learner 的型別仍維持與 shared 解耦，需同步更新手寫 DTO 與契約測試。

## 19. 佇列、狀態與錯誤處理

### 19.1 Visual Run 狀態

~~~text
pending → planning → [waiting_reference_review] → generating
   │          │                    │                ├→ partial_failed → generating（重試）
   │          │                    │                └→ review → published → superseded
   ├──────────┴────────────────────┴──────────────────────────────→ failed
   └─────────────────────────────────────────────────────────────→ cancelled
~~~

waiting_reference_review 只有採用 Q4 時存在。若部分 Slot 失敗且沒有工作仍在執行，Run 進入 partial_failed，管理者可以只重試失敗項目。

### 19.2 Candidate 狀態

~~~text
pending → processing → ready → approved
   │         │       │      └→ rejected
   │         │       ├──────→ failed
   │         └───────└──────→ uncertain
   └────────────────────────→ cancelled
~~~

### 19.3 重試規則

- 429、timeout 與可恢復 5xx 使用指數退避重試。
- 驗證錯誤、無效參數、內容政策拒絕等不可恢復錯誤不盲目重試。
- 每次 API attempt 都留下 ledger；費用標記為 estimated、actual、not_charged 或 unknown，不假設每個失敗都一定被計費。
- 達最高次數或最高預算後停止建立後續付費呼叫。
- Run／job 的唯一 idempotency key 可防止雙擊與尚未送出前的重複排程，但不得宣稱能保證供應商端不重複計費。
- Adapter 只有在供應商明確支援時才把 idempotency key 傳到上游，並宣告能否查詢既有 request。
- worker 重啟後可回收尚未送出的 stale job；如果 request 可能已送出但結果未落庫，attempt 轉 uncertain，不自動重試，等待查詢或管理者決定。
- 每次送出前在資料庫 transaction 中保留 reserved_cost_usd_micros；完成後轉為 actual，確定未計費才釋放。多 worker 不得同時穿透 Run 上限。
- 不得在同一 worker process 中阻塞現有翻譯／TTS queue。

## 20. 圖片儲存、派送與生命週期

### 20.1 Storage 抽象

程式只保存 storage object key，不讓業務邏輯依賴本機絕對路徑。首版若採 Mac Mini named volume，建議結構：

~~~text
/data/images/articles/{articleId}/runs/{runId}/
  cover/master.ext
  cover/card.webp
  cover/hero.webp
  cover/player.webp
  paragraphs/{paragraphId}/{candidateId}.ext
  paragraphs/{paragraphId}/{candidateId}.webp
~~~

檔名使用數字 ID 或安全 UUID，不使用原文或未清理的文章標題。

### 20.2 衍生圖與快取

- 保存供應商原始 master，並在本地生成適合網頁的 WebP／縮圖。
- 同一封面 master 衍生 card、hero 與 player 尺寸，不增加生圖費用。
- 版本化 URL 或檔名允許長期 cache，重新生成不會命中舊圖。
- API 回傳寬高、focal point 與 alt text，避免版面跳動及錯誤裁切。

### 20.3 生命週期

- Compose 新增 images volume，掛載至 image-worker 與 API。
- API 新增 /images/ 靜態服務。不得直接複製目前 /audio/ 的 app-level auth bypass：MVP 應同時要求 Cloudflare Access 與應用層驗證，並將 API host port 綁定 loopback 或取消對外映射，避免繞過邊緣直接下載。若未來採物件儲存，則使用短效 signed URL 或等效受控方式。
- scripts/backup.sh 與 restore 流程必須納入 images。
- 刪除文章時，資料表以 FK cascade 清除；檔案清理採可重試、冪等流程。
- 不得在發布新版本時立即刪除舊 published 圖片。
- 由多個 revision 共用的 asset，只有在沒有任何 Candidate 引用、也不屬於目前 published Run 時才能刪除實體檔。
- 資料列刪除與檔案刪除使用 outbox／cleanup job 協調；檔案清理失敗可重試，不能讓資料庫 transaction 假裝遠端檔案一定同步刪除。
- 舊 revision 保留與清理策略見第 23 節。
- 未來改用 R2／S3 時，應只替換 storage adapter 與 URL 產生方式。

## 21. 成本、權限、安全與測試

### 21.1 成本估算與保護

若文章有 P 個要求生圖的段落，基本圖片輸出數為：

~~~text
圖片輸出數 = P + 封面 1 張 + 參考圖 R 張
~~~

另計：

- 一次或多次文字 Planner API。
- 參考圖片 input 成本。
- Provider 的 image input／output 或按張費用。
- 教學單字物件定位的 vision call 費用。
- 自動品質檢查／OCR 費用。
- 重試成本。

需求如下：

- 建立 Run 前一定先呼叫估價端點並要求二次確認。
- UI 同時顯示基準估價與含重試預留的最高估價。
- Run 必須有 maxCostUsdMicros；每次送出前原子保留預估費用，保留後可能超過上限時停止排程。
- 每個 Candidate／attempt 保存 cost 的 estimated／actual／unknown 狀態、usage 與定價快照，不能把未知誤報為零。
- pricing profile 必須有 lastVerifiedAt，過期時 UI 明確警告。
- 同一 idempotency key 重送不得建立第二個 Run 或重複尚未送出的圖片工作；已送上游但結果不明時必須標記 uncertain，不承諾供應商端零重複扣款。
- 自動測試與 fixture seed 的 API 成本永遠為零。

### 21.2 權限與秘密

- 只有 admin 可以估價、建立、取消、重試、審核與發布。
- 學習者只能取得 published 圖片，不得取得 Prompt、usage、內部錯誤或候選圖。
- OPENAI_API_KEY 只注入 image-worker。
- Google 沿用 server-side GEMINI_API_KEY 或 service account。
- 金鑰不放模型 catalog、資料庫、回應、前端 build、日誌或圖片 metadata。
- 管理端只能傳 allowlisted Model ID，不得傳任意上游 URL。

### 21.3 兒童內容安全

- System Prompt 明確要求適齡、非驚悚、非性化、無危險模仿指引。
- 不要求模仿在世藝術家的專有畫風；使用一般媒材與視覺特徵描述。
- Provider 內容政策拒絕時，不把原始錯誤全文顯示給孩子。
- 發布前至少有人工作業核准；自動語意／OCR QA 若納入，費用需透明。
- alt text 與 overlay 必須 escape，不允許注入 HTML。

### 21.4 測試策略

所有測試皆使用 mock provider，禁止呼叫真實 OpenAI、Gemini、LLM 或 TTS。

單元測試：

- Model catalog schema、重複 ID、預設模型、disabled model 與 provider profile 驗證。
- Provider adapter request／response 正規化、timeout 與錯誤分類。
- Visual Plan schema、段落 ID 完整性、source hash 與 Prompt 組裝。
- Teaching Target 必須來自原文、數量上限與座標範圍。
- 成本估算、quote 到期／參數綁定、上限、idempotency 與重試退避。
- 上游送出後模擬 crash 時建立 uncertain attempt，且不自動重送。
- 並行 worker 的 reserved cost 不可穿透 Run 預算。
- 狀態機不得非法轉換。

整合測試：

- 獨立測試 DB 中建立文章、Visual Run、Slot、Candidate、發布與重新生成。
- 圖片 job 不影響 articles.status、paragraphs.status 與既有 jobs。
- 發布 transaction 原子切換，失敗時保留原 published Run。
- cover-only／單段增量 Run 能繼承 parent 其他資產，且 published Run 保持唯讀。
- 刪文章 cascade 與測試暫存圖片清理。
- learner API 只回 published 資產，且舊文章回 null。

前端測試：

- 模型選擇、估價確認、進度、失敗、取消、重試、審核與發布。
- 有 AI cover 時顯示圖片；沒有或載入失敗時顯示現有 fallback。
- 段落有圖／無圖都能閱讀、播放、切換翻譯與點字。
- Overlay 拼字、點擊、鍵盤操作、響應式定位與隱藏功能。

真實 API smoke test 只能以明確的手動指令、測試文章、低預算與獨立開關執行，不納入 npm test 或預設 CI。

## 22. 驗收條件與風險

### 22.1 驗收條件

1. 管理端從 API 動態列出 OpenAI GPT Image 2 與 Gemini 3.1 Flash Lite Image。
2. 同一 provider 且相容既有 adapter 的新模型，新增合法設定並重啟後，UI 自動出現新選項，不需改 UI、API DTO 或 DB enum。
3. 不合法設定在啟動時一次回報完整錯誤。
4. 替 P 段文章建立完整 Run 時，基礎建立一個 cover Slot 與 P 個 paragraph Slots。
5. Visual Plan 必須涵蓋全部來源段落且保存完整 Prompt／模型設定快照。
6. 建立前顯示有期限的 estimateId 並要求確認；建立時驗證來源、模型、scope 與價格快照，達預算上限後不再送出新付費呼叫。
7. 選定 provider 失敗時不會暗中切換模型。
8. 重新產生建立新 revision；增量 scope 會繼承未重生 Slot，舊 published Run 在新版完成前保持可用且不可變更。
9. 發布時整套原子切換；失敗 rollback。
10. 既有文章沒有圖片資料時仍正常顯示 emoji／漸層與純文字。
11. 圖片生成、失敗或取消不改變現有 article／paragraph 翻譯語音狀態。
12. 封面 master 可衍生三種版位圖片，無額外生圖呼叫。
13. Teaching Target 拼字一定取自段落原文，預設不依賴模型烙字。
14. 每張已發布圖有 alt text、尺寸與可安全載入的 URL。
15. 圖片納入備份、還原與文章刪除流程。
16. API 金鑰不出現在前端、API response、資料庫、日誌或 catalog。
17. 全部自動測試使用 mock，執行測試不產生 API 費用。
18. 請求已送上游但結果不明時標記 uncertain，不會自動重送；管理端能看見並處理。
19. 多個 image-worker 並行時仍以 reserved cost 原子阻止超出 Run 預算。
20. /images/ 無法透過公開 host port 繞過既定驗證邊界。

### 22.2 主要風險與緩解

| 風險 | 緩解 |
|------|------|
| 角色或畫風跨段漂移 | 全文 bible、必要時參考圖、固定 snapshot、人工審核、保存拒絕原因 |
| 圖中文字拼錯 | 教學文字改由 HTML／SVG overlay；重要烙字需 OCR／人工 QA |
| 重送造成重複費用 | Run／job 唯一鍵防止送出前重複；attempt ledger 將送出後不明狀態標為 uncertain，不自動重試 |
| 圖片 queue 阻塞語音 | 獨立 illustration_jobs 與 image-worker |
| 新版生成一半被孩子看到 | Draft 隔離、published pointer、原子發布 |
| Model catalog 改動破壞歷史 | 每個 Run 保存完整 provider／model／config／pricing snapshot |
| 儲存量持續增加 | 衍生圖壓縮、可觀察容量、版本保留策略與人工清理 |
| 價格過期造成誤估 | pricing profile 標示更新日期與過期警告、Run 設硬上限 |
| Provider 政策或 API 變更 | Adapter 隔離、啟動驗證、官方模型 ID／能力在實作前再核對 |
| 圖片服務失敗影響閱讀 | 所有 visual DTO nullable；圖片錯誤時回到現有封面與純文字 |
| 靜態圖片繞過登入 | /images/ 採 app-level auth 或 signed URL，並禁止 API host port 直接對外 |

## 23. 待釐清事項

### 23.1 建議在拆實作計畫前確認

| # | 問題 | 影響 | 建議預設 |
|---|------|------|----------|
| Q1 | 生成完成後自動發布，還是必須人工審核？ | 決定狀態、管理 UI 與孩子看到錯圖的風險 | 必須人工核准，整版原子發布 |
| Q2 | 是否每一段一定一張圖，還是 Planner 可略過太短、重複或不可視覺化段落？ | 直接影響費用、版面密度與 Slot 完整性 | 每段建立 Slot；Planner 可建議略過，但需顯示理由且可人工改回 |
| Q3 | 第一版是否就包含圖片上的可點擊單字？每段最多幾個？ | 影響 Planner schema、overlay UI、QA 與驗收範圍 | 第一版納入 HTML／SVG overlay，每段 0–3 個 |
| Q4 | 有重複角色時，是否先生成角色 reference sheet 並停下等管理者核准？ | 顯著影響角色一致性、操作步驟與至少一張額外費用 | 故事型文章先核准 reference sheet；科普／無固定角色文章略過 |
| Q5 | Visual Plan 用固定文字模型，還是跟隨所選圖片 provider？ | 選 GPT Image 時是否仍會產生一筆 Gemini 文字規劃費用 | Planner 與圖片模型分離，首版沿用現有 Gemini 文字能力，並在估價中分列 |
| Q6 | 圖片首版存 Mac Mini volume，或直接使用 R2／S3？ | 影響部署、備份、URL 與 storage adapter 實作 | 小規模首版用本機 images volume，但業務層只存 object key |
| Q7 | Overlay 的物件座標要用 vision API 自動定位，還是由管理者手動放置？ | 自動定位會增加每張圖的 API 費用；純手動則增加操作步驟 | Phase 1 先人工放置；Phase 2 再用 vision 提出建議座標並允許拖曳修正 |

### 23.2 可採建議預設、日後再調整

| # | 問題 | 建議預設 |
|---|------|----------|
| Q8 | 新文章上傳完成後是否自動生圖？ | 不自動；由 admin 明確選模型、看估價後觸發 |
| Q9 | 完整重生以外，第一版要支援哪些 scope？ | Phase 1 只做 all；failed／missing、cover-only、單一 paragraph 於 Phase 2 開放 |
| Q10 | Provider 失敗時是否自動換另一家？ | 不允許；保留失敗並由管理者決定 |
| Q11 | 部分圖片失敗時是否允許發布？ | 不允許；舊版繼續服務，補齊或人工標記 skipped 後才發布 |
| Q12 | 模型設定是否要求 hot reload？ | 不要求；修改設定後重啟，避免排隊中途漂移 |
| Q13 | 封面是否把文章標題直接畫進圖？ | 不畫；標題維持 HTML |
| Q14 | 第一版使用即時背景呼叫還是 provider Batch API？ | 先用一般背景工作；Batch 作為後續節費模式 |
| Q15 | 舊 revision 保留多久？ | 第一版不自動刪除；目前 published 永遠不可刪，draft／failed／cancelled／superseded 只能由 admin 明確刪除 |
| Q16 | 全站固定一種畫風，還是讓每次產生選風格？ | 首版使用全站 house style；資料模型預留 style preset |
| Q17 | 同一 Run 的封面與段落圖可否使用不同模型？ | 不允許；同一 Run 鎖定單一模型。若換模型則 scope=all，避免畫風混雜 |

若採用右欄建議，真正需要產品確認的核心是 Q1–Q7，其餘不阻擋第一版設計。

## 24. 參考與後續

官方模型資料：

- OpenAI GPT Image 2：https://developers.openai.com/api/docs/models/gpt-image-2
- Google Gemini 3.1 Flash Lite Image：https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image

現有專案影響區域：

- 型別化設定：shared/src/config.ts
- Gemini transport／授權：shared/src/llm/genai.ts、shared/src/llm/auth.ts
- 文章與段落 API：api/src/routes/articles.ts
- 現有翻譯／TTS worker：worker/src/processor.ts、shared/src/repo/jobs.ts
- 現有封面與閱讀頁：web-learner/src/lib/cover.ts、web-learner/src/App.tsx
- 靜態音訊服務：api/src/static.ts
- 容器與 volume：docker-compose.yml
- 備份：scripts/backup.sh

本文件確認後，另建立 docs/plan-ai-article-illustrations-2026-09-05.md，將工作拆成可由 Agentic coding 逐步執行、每一步可測試且預設零真實 API 費用的實作計畫。正式套用資料庫 migration 前仍需使用者另行確認。
