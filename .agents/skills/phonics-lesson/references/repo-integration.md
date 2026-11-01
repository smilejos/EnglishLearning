# 程式與音訊路由

以下是 2026-11-01 短母音 a 原型的定位線索。使用技能時先核對當下程式；路徑或能力若已變更，以實作為準，不照抄過時限制。

已完成範例、素材重用與驗證快照見 [短母音 a 實作與接續紀錄](short-a-example.md)；詳細教材與驗收原始紀錄放在 Repo 的 `docs/phonics/preparation/short-a-word-families/`，接續時先核對既有進度，不重產已有效的素材。

## 讀取入口

| 位置 | 本次需核對的內容 |
| --- | --- |
| `web-learner/src/phonicsLesson.ts` | 示範詞排序、額外練習詞、題目、音檔 URL。 |
| `web-learner/src/PhonicsLearning.tsx` | 四階段內容、目標標色、字形分組、拼字塊完成判斷、短句點詞、音訊佇列與清理。 |
| `web-learner/src/PhonicsLearning.css` | 現有詞表排列、多字母／最長詞與手機版面。 |
| `web-learner/src/App.tsx`、`LearningHome.tsx` | 教材總覽與課程 hash 路由、切換時卸載／清理；新課入口如何加入。 |
| `web-learner/src/lib/audioBus.ts` | 全站音源互斥。 |
| `scripts/generate-phonics-audio.mjs` | 本課音訊工作清單、輸出目錄、來源重用、opt-in、本機端點限制。 |
| `scripts/generate-wordbank-audio.mjs` | `DEFAULT_PROFILE`、`generateBatch`、`validateMp3`、`withBatchLock` 等既有工具。 |
| `api/src/routes/wordbank.ts`、`shared/src/repo/wordbankPractice.ts`、`shared/src/wordbankAudio.ts` | 按詞條 GUID 查既有音訊 URL、用途與文字 hash 校驗；缺音回 `null`，不自動生成。 |
| `shared/src/repo/wordbankAudio.ts`、`api/src/static.ts` | 字庫音訊 metadata 與 `/audio/` 檔案服務；DB 路徑與實體 `AUDIO_DIR` 的關係。 |
| `web-learner/public/phonics/short-a/manifest.json` | 音訊文字、模型／聲線、來源、hash、時長及聽審狀態。 |
| `scripts/preview-phonics.mjs` | 不連正式 API／DB 的本機隔離預覽；目前固定 5174。 |

## 現況與新主題的相容性

目前已實作的是短母音 a 的字族版單課，並非通用教材匯入器：

- 第二階段已有 -at／-an／-ap 三字族（5／5／4，共十四詞），可點播、依目前字族 N 詞連播及切族停音重設；顯示單字的 CVC 標籤。尚無跨母音主題／拼法目錄或結構篩選，不代表所有字族目錄都已接入。
- `#/phonics/short-a`、`/phonics/short-a/`、教材標題與說明仍含固定值。
- `MarkedWord` 已依 `targetRanges` 標色，拼讀已依明列的 `graphemes` 呈現，單字另有 `familyId／structure／phonemes`。本課只驗證三字母 CVC；不能以此宣稱 `sh`、`ai` 或不連續 `a_e` 的版面與作答均已通過。
- 拼字目前仍是單字元字母塊，完成格數依單字字元數，母音樣式已改用 `targetRanges`；以字形組合作答與重複字母案例須另外核對，不把字形顯示能力當成作答能力。
- 短句文字、翻譯、可點詞、音訊 key 與支援詞提示已由 `shortASentences` 提供；插畫仍在本課程式中選用貓／男子坐墊 SVG，未成為跨課通用媒體設定。
- 產音腳本的詞表、短句、目的地、素材 ID 前綴與教材備註固定為 short-a；沒有 `--lesson` 或通用教材檔參數，不虛構相關指令。

## 新主題接入核對清單

使用者要求接入後才執行；以下列出新課應具備及仍須驗證的能力，不代表短 a 原型已全部通用化：

1. 課程內容可表達主題、拼法、字族及其韻尾讀音／實際詞表；單字保留識別、詞義、實際讀音、結構標籤、字形分組及目標範圍。完整層級與候選目錄見 [教材格式](lesson-format.md) 和 [字族目錄](word-family-catalog.md)，不是新增 DB schema 或現成匯入契約。
2. 第二階段按課程順序進入第一字族，允許切字族。CVC 等作標籤／輔助篩選，不能限制只有三種結構；CV、CCV、CCVCC 等按實際音素結構呈現，不以預設 CVC 過濾掉合適的長母音詞。
3. 詞表與進度分母用實際 N，不固定十／二十／三十。全部播放限定目前字族／明示批次；換主題、拼法、字族或篩選都取消舊音訊及待播計時器，重設新詞表第一詞，不自動播放；單字點播立即取代佇列。若篩選後沒有詞，清除選取、顯示空狀態並停用播放，不讀取不存在的第一詞或顯示除以零的進度。
4. 字形呈現與拼字作答單位分開：支援多字母或不連續字形、明確目標位置，並依實際作答塊判定完成。短句、重點詞與常用／例外詞提示依課程內容，不繼續寫死 a 或貓插畫。
5. 練習仍以每課八題、短句以每課兩句為預設，按已學字族安排混合練習；不因多了字族就自動複製多套。資料關聯與媒體識別須可核對到正確單字／句子。
6. 新課產音先讓工作清單、輸出目錄與素材識別對準該課，再重用／補缺；保留現有有效 short-a 素材與來源紀錄。未實作參數前，不把下列既有命令當成新課通用工具。

優先沿用既有前台與本機靜態教材方式做必要適配，保留既有課程與功能；更新技能或接入新課不自動擴充後台、DB 或新 API。真實音訊生成仍依當次授權。

## 既有音檔盤點與共用

- DB 保存音檔 metadata，實體 MP3 放在音訊檔案目錄。字庫已有整字、英文解釋及英文例句音訊種類；文章另有段落、單字、解釋／例句錄音，須依各自資料關聯與介面查找，不假設所有來源共用同一 GUID 或路由。
- 已知詞條 GUID 時可用 `GET /wordbank/entries/:guid`，回傳 `wordAudioUrl`、`explains[].audioUrl`、`examples[].audioUrl`。按用途及詞條／素材 GUID 對應，`wordbankTextHash` 對 trim 後的文字計算 hash，仍區分大小寫與標點；文字 hash 或合法路徑不符、缺 metadata 時 URL 為 `null`。有效 URL 形如 `/audio/wordbank/...mp3`，實體由 `AUDIO_DIR` 提供，仍須核對檔案及教學讀音。
- 上述路由 handler 只查既有資料，不建立 TTS／job；透過一般 API 查詢仍沿用既有驗證，不能因此把整個正式請求視為絕對無寫入（`ensureUser` 可能更新 `last_seen_at`）。不為本機隔離預覽接上正式 API；依既有授權取得的離線 metadata／檔案也可供盤點。
- 正式整合以共用素材識別及既有播放介面為優先，避免每課複製相同音檔；需接入的資料映射、驗證與缺音顯示按本次範圍實作。現有 phonics 前台仍固定使用 `/phonics/short-a/${key}.mp3`，尚未即時查 DB，不能把此規範描述為已完成功能。
- 現有 `generate-phonics-audio.mjs` **只**搜尋 `data/wordbank-audio/manifest.json` 中 `kind === 'word'`、文字 hash 相同且完整 profile 相同的素材，驗證 MP3 後複製；不查 DB、文章或例句音訊。profile 包含模型、聲線、指令、語言與格式。不同 profile 的素材須另行評估、保留原 metadata，不能說目前腳本會自動沿用。
- 盤點以本課播放清單為範圍：先查字庫，再查適合的文章／例句與教材素材，核對完整文字、詞義／讀音、口音、聲線及檔案。列出合格可重用素材與缺件理由，僅缺少、失效或不適用且無合適替代者進入補音清單；不以字庫總詞數推算音檔覆蓋率。
- 整字可跨四階段共用；整句文字與用法相符才沿用。孤立音素與逐音拼合另需專用素材，不裁切或串接整字後冒稱已驗收的音素／自然整句。每課保留來源 GUID／路徑或 URL、原生成設定、文字與檔案 hash、時長及獨立聽審狀態；格式見 [教材格式](lesson-format.md)。

## 補缺回寫第二功能

後續教材的缺詞與一般整詞錄音回補既有共用字庫，詳細流程、增量格式、CLI 與保留原音限制見 [回補共用字庫](wordbank-backfill.md)。這是已確認的製作規範；目前 phonics 腳本尚未自動完成補詞、canonical 同步、服務檔案轉存與 metadata 匯入，不把規範當成已接入能力。

相關實作入口為 `shared/src/wordbank.ts`、`shared/src/repo/wordbank.ts`、`shared/src/wordbankAudio.ts`、`shared/src/repo/wordbankAudio.ts`、`scripts/import-vocabulary.ts`、`scripts/import-vocabulary-audio.ts`。兩個 importer 的 `--dry-run` 只做離線檢查；audio importer 按 asset GUID 更新既有 metadata，正式匯入必須只含核對過的缺音增量。

## 本機 Qwen3-TTS

原型使用既有 `DEFAULT_PROFILE`：`mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`、Serena、English。這是目前設定，不是所有未來課程都不可變更的要求。

現有命令只準備短母音 a：

```bash
# 只列現有 short-a 工作計畫，不呼叫 TTS
node scripts/generate-phonics-audio.mjs

# 有實際生成授權時，使用本機服務重用／補缺
PHONICS_REAL_TTS=1 node scripts/generate-phonics-audio.mjs --generate
```

預設端點為 `http://127.0.0.1:8000/v1/audio/speech`；`PHONICS_TTS_ENDPOINT` 只允許本機 HTTP。執行前確認腳本的工作清單與輸出目錄已對準本次要做的課程，**不要把上述命令宣稱為新主題的通用產音器**。修改新課工具時保留 dry-run、顯式 opt-in、本機限制、有效素材重用、hash／manifest、batch lock 與可接續能力；不覆寫短母音 a 素材。

目前腳本的自動重用要求完整 profile 一致；其他既有錄音是否適用，依上節人工核對，不為通過 profile 檢查而改寫來源設定。文字或模型版本改變時不能沿用錯誤 metadata。一般測試以假 client／假 Audio 驗證，不真的呼叫 TTS。

## 預覽與驗證

```bash
npm run phonics:preview
node --test scripts/preview-phonics.test.mjs
npm test -w @el/web-learner -- PhonicsLearning.test.tsx phonicsLesson.test.ts App.phonics.test.tsx
npm run typecheck
npm run build -w @el/web-learner
```

`phonics:preview` 目前提供 `http://127.0.0.1:5174/#/phonics`；新課連結須等路由實作後才能列為可用。埠被占用時確認已有服務是否能重用，不另起或關閉不明程序。

隔離預覽對 `/me` 回空使用者、其餘既有 API 回 503，不設 API proxy。一般 Vite dev 仍可能打到正式 API；App 的 `/me` 驗證會更新使用者資料，不能把一般開頁當作正式 DB 唯讀操作。

改程式後還需依 `AGENTS.md` 執行全專案 `npm test`；測試資料庫保護與清理由既有 npm 指令處理。若繁中排序受執行環境語系影響，可沿用已驗證的 `LC_ALL=zh_TW.UTF-8 npm test`，保留真實結果，不修改斷言換取通過。純教材／技能的文件驗證本身不需啟動 DB、真實生成或正式服務；提交前的完整測試要求仍依 `AGENTS.md`。
