# 字庫單字練習：需求與資料準備

更新日期：2026-10-05。

## 已確認需求

- 新入口首頁提供「文章閱讀」「單字練習」「情境模擬」三個功能；文章閱讀沿用現有功能，情境模擬留待未來。
- 使用 `source/vocabulary-database.json` 的全部 **9,166** 詞條。單字練習以字庫為來源，不從文章或收藏清單抽題。
- 一次使用一套分級制度：`level.tw_7000`、`level.list` 或 `level.cefr`。選 A2 僅包含 A2，不累計 A1；其他級別同樣精確匹配。
- 同字多詞性、多義一起練習；每次隨機選一個符合篩選的詞條，從其例句隨機抽三個。
- 這階段不保存作答或熟悉紀錄、不加入收藏，也沒有固定題數或自動評分。既有文章收藏／複習功能保留。
- 中文定義或英文解釋缺少的詞條仍匯入資料庫，使用者日後透過其他方式補齊。此次不呼叫 LLM 補寫。

| 模式 | 揭曉前 | 揭曉後 |
| --- | --- | --- |
| 單純練習 | 直接顯示完整單字、定義與三個完整例句 | 不需揭曉 |
| 聽力練習 | 所有字只顯示字首，其餘遮蔽；完全隱藏例句文字。提供單字與例句朗讀 | 顯示完整單字資料與三個中英例句 |
| 單字挑戰 | 四字母以上顯示字首／字尾，少於四字母只顯示字首；顯示全部英文解釋 | 顯示完整單字、英文解釋與三個中英例句 |

「少於四個字節」依本次確認解讀為少於四個英文字母，例如挑戰 `apple → a•••e`、`cat → c••`；聽力則為 `apple → a••••`、`cat → c••`。

「全部」與「未分類」篩選是先前提出的介面建議，尚未作為獨立需求確認。資料庫保留所有 null 分級。缺英文解釋的詞條在挑戰模式如何呈現，待前台實作時處理；不得自動用真實 LLM 補寫。

## 本階段範圍

先準備獨立字庫資料表、可重跑的匯入工具，以及本機 TTS 批次音檔。入口首頁、練習頁面、字庫 HTTP API 尚未實作；不要把資料匯入或音檔完成當作前台功能已上線。

- Migration：`migrations/1791158400000_wordbank.sql`。
- `wordbank_entries` 保存詞條 GUID、原始 id、word、詞性、定義、英文解釋、全部中英例句、三種分級、category、scenario。
- `wordbank_audio` 保存單字／例句 GUID 與詞條關聯、相對檔案路徑、模型／聲線／語氣、文字 SHA-256、音訊時長與大小。
- 字庫與既有 `words`、`word_explanations`、`vocabulary_items` 分開；匯入不刪文章或收藏。
- 重匯採補缺策略，保留資料庫已有非空文字與分級，例句／解釋依 GUID 合併、補空欄位，陣列分類採聯集。修正既有非空內容應直接更新資料，不靠重新匯入舊 JSON 覆蓋。

## 第一批音檔

使用者已明確授權本機 Qwen3-TTS 批次產音：

- 範圍：`level.list === "basic"`，**1,193 單字＋4,108 英文例句＝5,301 段**。保留每字全部例句的音檔，讓前台之後能任抽三句。
- 模型：`mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`。
- 聲線：`Serena`；語言：`English`；格式：MP3。
- 語氣：幼稚園英語老師。實際送出 `Speak warmly and clearly, like a kindergarten English teacher. Use a gentle, encouraging tone and careful pronunciation.`。
- API：`POST http://localhost:8000/v1/audio/speech`，參考 `source/qwen3-tts.html`。本機服務回傳二進位音訊，生成器自行保存。
- 預設輸出：`data/wordbank-audio/wordbank/<profileHash>/<assetGuid>.mp3`；清單與進度存於 `data/wordbank-audio/manifest.json`、`data/wordbank-audio/report.json`。`data/` 不納入 Git。
- 此次不生成中文或英文解釋音檔。本次只執行 basic；生成器也可選 advance、expert 或 all，但尚未為這些範圍產音。

每段完整下載後，以 ffprobe 檢查 MP3／時長並用 ffmpeg 完整解碼，再原子改名與更新 manifest。相同模型、聲線、語氣及文字 hash 的有效音檔續跑時跳過；損毀或遺失檔案重做。連續三筆失敗停止；同一輸出目錄有程序鎖，避免重複生成。

語氣指示確實送入本機模型生成，但音色與教學語氣仍需聽感驗收。只有檔案解碼通過，不代表發音與例句內容已人工審核。

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

# 先將音檔複製到目標 AUDIO_DIR 的 wordbank/ 子目錄，再匯入 manifest metadata
npm run vocabulary:audio:import -- data/wordbank-audio/manifest.json

# 批次工具測試使用假 HTTP 回應，不呼叫真實 TTS
npm run vocabulary:audio:test
npm test
npm run typecheck
```

字庫與音檔匯入指令不自行載入 `.env`，寫入時需由呼叫環境明確提供 `DATABASE_URL`；manifest 匯入不負責複製音檔。音檔路徑必須是 AUDIO_DIR 下的相對路徑。

生成器以 JSON 作為文字來源。未來在 DB 補寫或修正英文例句後，需同步匯出包含相同 GUID 的字庫 JSON，再以 `--input` 指定新檔生成；匯入音檔 metadata 時會以 DB 當下文字 hash 核對，避免誤配舊錄音。

全字庫的測試匯入只准使用 `shared/src/testing.ts` 保護的 `_test` 資料庫；不可讓測試清表邏輯接觸正式庫。音檔生成是本次使用者明確授權的實際作業，不屬於一般測試。

已知資料問題：原始資料有部分缺中文定義、英文解釋、分級，也有拆分字形的定義／例句不完全相符，例如 actress 的例句仍出現 actor。此次完整保留原始內容，後續補資料時應一併校正。
