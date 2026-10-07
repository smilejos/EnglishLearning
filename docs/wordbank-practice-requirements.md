# 字庫單字練習：需求與實作現況

更新日期：2026-10-07。

## 已確認需求

- 新入口首頁已提供「文章閱讀」「單字練習」「情境模擬」三個入口；文章閱讀沿用現有功能，情境模擬停用並標示「即將推出」。
- 使用 `source/vocabulary-database.json` 的全部 **9,166** 詞條。單字練習以字庫為來源，不從文章或收藏清單抽題。
- 一次使用一套分級制度：`level.tw_7000`、`level.list` 或 `level.cefr`。同套可多選級別及「未分類」，選 A2 僅包含 A2，不累計 A1；其他級別同樣精確匹配。預設字庫分級／全部，選「全部」清除個別級別，取消最後一個級別或切換制度都回到全部。
- 同字多詞性、多義一起練習；每次隨機選一個符合篩選的詞條，從其例句隨機抽最多三個；不足三個全部顯示，不補造內容。下一字可再次抽到同字。
- 這階段不保存作答或熟悉紀錄、不加入收藏，也沒有固定題數或自動評分。既有文章收藏／複習功能保留。
- 首版匯入時保留中文定義與英文解釋缺漏。2026-10-07 使用者另行授權協調者搭配四個 Luna 作者及一個 Luna 覆核者補齊，先更新來源 JSON，再同步正式字庫；完成統計與既有資料待核實清單見 [補齊報告](wordbank-completion-2026-10-07.md)。

| 模式 | 揭曉前 | 揭曉後 |
| --- | --- | --- |
| 單純練習 | 直接顯示完整單字、全部詞性、中文定義、英文解釋與完整中英例句 | 不需揭曉 |
| 聽力練習 | 單字只顯示第一個字母，其餘遮蔽；例句文字與解釋不放入 DOM。提供可用的單字與例句朗讀 | 顯示完整單字資料與中英例句 |
| 單字挑戰 | 滿四個 Unicode 字母顯示首尾，較短只顯示首字母；顯示全部非空英文解釋，先隱藏詞性、中文定義與例句 | 顯示完整單字資料與中英例句 |

「少於四個字節」依本次確認解讀為少於四個字母，實作以 Unicode 字母（含重音字母）計數，不使用 UTF-8 byte 長度；標點不算字母且遮蔽。例如挑戰 `apple → a•••e`、`cat → c••`；聽力則為 `apple → a••••`、`cat → c••`。揭曉前的 DOM、朗讀按鈕 aria-label 不含被隱藏的答案／句子；揭曉後焦點移至答案標題。

資料庫保留所有 null 分級，「未分類」可與同套級別一起選取。缺詞性、中文定義、英文解釋或例句顯示「待補」；挑戰缺解釋會提示可先揭曉或換字，不排除該詞條、不自動補寫。缺音檔顯示「待準備」並停用朗讀；已有 URL 但播放失敗時顯示可重試錯誤，不觸發生成。

2026-10-05 追加確認：basic 的全部 **3,591 段英文解釋**也需產音。英文解釋逐段提供朗讀，沿用同一聲線與音訊互斥；單純練習、挑戰提示與揭曉後可播放，聽力揭曉前仍完全隱藏解釋及其按鈕。

## 已完成範圍與部署狀態

入口首頁、三模式練習頁、字庫讀取 API、代理設定、獨立資料表、可重跑匯入與本機 TTS 工具均已實作。本機正式 DB 已套用字庫 migration、匯入全 9,166 詞條及 basic 全 8,892 段音檔 metadata，MP3 已複製至 audio volume。新版介面在 `http://127.0.0.1:5174` 配合 `http://127.0.0.1:8180` 驗收；API 使用 `api/src/preview.ts`，保留既有 auth，不注入真實生成 client，也不啟動 worker。**尚未部署新版服務，網站上線狀態不可由本機驗收推定。**

2026-10-07 已補上 3,839 筆中文釋義，以及 2,974 筆詞條各三段英文解釋（共 8,922 段）。來源 JSON 與本機正式 `english_learning` 字庫全部 9,166 筆逐筆一致，缺中文／英文解釋／例句皆為零；英文解釋總數 27,537 段，中英例句維持 32,866 組。本次保留原始非空文字、詞性、分級、例句及既有 GUID，全部 8,892 筆音檔 metadata 內容未變。新增解釋尚未產音。

- 路由：根路徑（空 hash）為首頁，`#/articles` 是既有文章清單、`#/practice` 是字庫練習；保留 `#/a/<id>` 與 `#/review`，文章分享、複習來源定位、上一頁／下一頁仍可用。
- `GET /wordbank/options` 回總詞條數及三套分級的全部、固定級別、未分類數量，零筆也保留；不接受 query。
- `GET /wordbank/random` 接收 `system=all|list|cefr|tw_7000`（預設 all）、逗號分隔 `levels`；省略 levels 或 `levels=all` 取全部，指定級別須屬同一制度，多值採 OR，`unclassified` 對應 null。回 `{ poolSize, entry }`，只回一詞條及最多三例句；空池回 200／entry null，非法／額外參數回 400。
- 字庫 API 保留正常身分驗證，reader／reviewer／admin 都能讀；沒有新建 job、補字義或收藏的副作用。proxy、learner nginx 與 Vite 已轉發 `/wordbank`。
- 模式、級別、下一字會停止音訊、重新抽題並重設揭曉；離頁停止，取消的舊請求不覆蓋新結果。級別與抽題各有載入／錯誤／重試，空池可調整範圍。音訊沿用 audioBus，與文章／收藏複習避免疊音。

- Migration：`migrations/1791158400000_wordbank.sql`、`1791158400001_wordbank-explanation-audio.sql`（本機正式 DB 已套用）。
- `wordbank_entries` 保存詞條 GUID、原始 id、word、詞性、定義、英文解釋、全部中英例句、三種分級、category、scenario。
- `wordbank_audio` 保存單字／例句／英文解釋 GUID 與詞條關聯、相對檔案路徑、模型／聲線／語氣、文字 SHA-256、音訊時長與大小。英文解釋使用 `kind=explanation`，API 的 `explains[].audioUrl` 為可用 URL 或 null。
- 字庫與既有 `words`、`word_explanations`、`vocabulary_items` 分開；匯入不刪文章或收藏。
- 重匯採補缺策略，保留資料庫已有非空文字與分級，例句／解釋依 GUID 合併、補空欄位，陣列分類採聯集。修正既有非空內容應直接更新資料，不靠重新匯入舊 JSON 覆蓋。

## 第一批音檔

使用者已明確授權本機 Qwen3-TTS 批次產音：

- 已完成範圍：`level.list === "basic"`，**1,193 單字＋4,108 英文例句＋3,591 英文解釋＝8,892 段**。保留每字全部例句的音檔，供前台任抽三句；不是只錄每字三句。
- 模型：`mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`。
- 聲線：`Serena`；語言：`English`；格式：MP3。
- 語氣：幼稚園英語老師。實際送出 `Speak warmly and clearly, like a kindergarten English teacher. Use a gentle, encouraging tone and careful pronunciation.`。
- API：`POST http://localhost:8000/v1/audio/speech`，參考 `source/qwen3-tts.html`。本機服務回傳二進位音訊，生成器自行保存。
- 預設輸出：`data/wordbank-audio/wordbank/<profileHash>/<assetGuid>.mp3`；清單與進度存於 `data/wordbank-audio/manifest.json`、`data/wordbank-audio/report.json`。`data/` 不納入 Git。
- 英文解釋追加批次 **3,591 段已全部生成，零失敗**，既有 5,301 段未重錄。不生成中文音檔；其他分級尚未產音。
- 背景後處理已核對 GUID／文字 hash／檔案大小、複製至 audio volume 並匯入 metadata，於 **2026-10-06 00:19（台北時間）**完成。`data/wordbank-audio/explanation-completion.json` 的狀態為 `complete`，manifest 與 DB 均為 8,892 段。

每段完整下載後，以 ffprobe 檢查 MP3／時長並用 ffmpeg 完整解碼，再原子改名與更新 manifest。相同模型、聲線、語氣及文字 hash 的有效音檔續跑時跳過；損毀或遺失檔案重做。連續三筆失敗停止；同一輸出目錄有程序鎖，避免重複生成。

語氣指示確實送入本機模型生成；本機已抽樣確認單字與三個例句可實際播放。追加解釋音檔已抽查 API 網址與正式音檔入口的完整 MP3／Range 讀取。全部檔案解碼通過不代表 8,892 段發音、教學語氣與內容都已逐段人工審核。

## 指令與驗證

```bash
# 預覽匯入數量，不寫 DB
npm run vocabulary:import -- --dry-run

# 需要明示目標 DATABASE_URL；實際寫入正式庫仍須遵守 AGENTS.md 授權規則
npm run vocabulary:import

# 不呼叫 TTS，只列出 basic 產音計畫
npm run vocabulary:audio:generate -- --dry-run --list basic

# 真實本機產音須明確 opt-in，且要先確認服務已啟動
WORD_BANK_REAL_TTS=1 npm run vocabulary:audio:generate -- --generate --list basic

# 只補英文解釋，保留 manifest 中既有單字／例句音檔
WORD_BANK_REAL_TTS=1 npm run vocabulary:audio:generate -- --generate --list basic --kinds explanation

# 先將音檔複製到目標 AUDIO_DIR 的 wordbank/ 子目錄，再匯入 manifest metadata
npm run vocabulary:audio:import -- data/wordbank-audio/manifest.json

# 批次工具測試使用假 HTTP 回應，不呼叫真實 TTS
npm run vocabulary:audio:test
npm test
npm run typecheck
```

字庫與音檔匯入指令不自行載入 `.env`，寫入時需由呼叫環境明確提供 `DATABASE_URL`；manifest 匯入不負責複製音檔。音檔路徑必須是 AUDIO_DIR 下的相對路徑。

生成器以 JSON 作為文字來源，預設涵蓋單字、所有英文例句與英文解釋；`--kinds` 可選 word、example、explanation，以逗號組合。未來在 DB 補寫或修正英文例句／解釋後，需同步匯出包含相同 GUID 的字庫 JSON，再以 `--input` 指定新檔生成；匯入音檔 metadata 時會以 DB 當下文字 hash 核對，避免誤配舊錄音。

練習讀取時也會核對 metadata 的文字 hash 與當下內容，只提供格式合法的字庫 MP3 相對路徑；舊文字錄音失效時回 null 並顯示待準備。此步不逐次檢查實體檔案，檔案遺失由前台播放失敗提示處理。

全字庫的測試匯入只准使用 `shared/src/testing.ts` 保護的 `_test` 資料庫；不可讓測試清表邏輯接觸正式庫。2026-10-05／06 的音檔生成為當時使用者明確授權的實際作業；2026-10-07 補文字未呼叫真實 TTS／圖片 API，也未啟動或部署服務。

已知資料問題：中文定義與英文解釋的空白已補齊，原有 null 分級仍保留。舊資料另有詞性、定義或例句錯配，例如 actress 的定義仍寫「男演員；演員」、例句仍出現 actor。這些既有非空內容未在本次補缺中覆寫，待核實清單見 [補齊報告](wordbank-completion-2026-10-07.md#既有資料待核實清單)。

## 驗證紀錄

- 2026-10-07 補文字後，`LC_ALL=zh_TW.UTF-8 npm test` 共 501 tests 通過（shared 225、API 117、worker 17、admin 79、learner 63）；`npm run typecheck` 通過。測試庫以原始 JSON 建立基線，再執行 `npm run vocabulary:import` 及重匯，全部 9,166 筆與補齊 JSON 一致；正式庫同步後逐筆比對一致，既有音檔 metadata 全內容不變。
- 四位 Luna 作者補寫，獨立 Luna 覆核者完成全部 6,813 筆待補詞條的模型 read-back；協調者另做分片完整性、只補空欄位、GUID、直接答案詞形與統計檢查。這是模型覆核與機械驗證，未宣稱全部內容已經人工逐筆審閱。

- 2026-10-06 加入英文解釋音檔後，`LC_ALL=zh_TW.UTF-8 npm test`：501 tests 通過（shared 225、API 117、worker 17、admin 79、learner 63）；`npm run typecheck` 與 `npm run build` 通過。生成器假 HTTP 測試另有 9 tests 通過，不呼叫真實 TTS。
- API／DB 測試涵蓋精確級別、多選 OR、未分類、空池、非法 query、同字完整資料、最多三例句、身分驗證、無收藏／job 副作用及文字 hash 失效。前台測試涵蓋三模式、Unicode 遮罩、DOM／aria 隱藏答案、請求競態、錯誤重試、缺資料與切換／離頁停止音訊。
- 本機桌面／手機介面及 basic 實音已驗收；截圖保存在 `.impeccable/review/`（home、practice、challenge、listening，另含 `listening-audio-ready.png`）。這些結果不代表新版服務已部署，也不代表其他分級的音檔已完成。
