# 字尾變化製作與驗收紀錄

2026-11-02。本批為使用者指定「字尾變化 -s -es -ed -ing」的四階段教材製作與本機接入；正式匯入、部署與人工聽審另列。

## 內容與順序

| 順序／小課 | 教學目標 | 詞組／詞／題／句 | 完整教材 |
| --- | --- | --- | --- |
| 1. endings-s | 複數 -s 的 /s z/，不多加母音 | 2／8／8／2 | [lesson](../endings-s/lesson.md) |
| 2. endings-es | s／sh／x／ch／tch 後的 /ɪz/；名詞與動詞用途分開 | 3／8／8／2 | [lesson](../endings-es/lesson.md) |
| 3. endings-ed | 規則過去式 /t d ɪd/；依原形最後聲音判斷 | 3／9／8／2 | [lesson](../endings-ed/lesson.md) |
| 4. endings-ing | /ɪŋ/；直接加、雙寫、去不發音 e、保留 y | 4／8／8／2 | [lesson](../endings-ing/lesson.md) |

合計 33 個不同詞、32 題（16 聽音選字／16 聽音拼字）、8 個短句、12 個示範詞次。每課四階段可自由切換；從基本原形到已學子音組合，再加雙寫／刪 e 等拼字變化，沒有用陌生遷移詞湊數。新增詞組依字尾讀音與拼字規則分組，不虛構共同韻尾字族。

來源照片 `screenshots/IMG_3254.HEIC` 只有目錄的 Inflected Endings（p18–21），沒有課文內頁；詞表、題目與短句為本批自編。發音與拼字規則查核依據：

- [Iowa State University：-ed and -s Endings](https://iastate.pressbooks.pub/teachingpronunciation/chapter/chapter-5-ed-and-s-endings/)：依 root 最後聲音選讀法；美式弱母音可記 /ə/。
- [British Council：Snake or fly?](https://africa.teachingenglish.org.uk/classroom/pronunciation/snake-or-fly)：/s z ɪz/。
- [BBC：-ed endings 工作紙](https://downloads.bbc.co.uk/learningenglish/features/the_pronunciation_lounge/pron_lounge_episode_9_worksheet.pdf)：/t d ɪd/。
- [UNAM：The ing form](https://portalacademico.cch.unam.mx/ingles2/what-are-you-doing/the-ing-form)：單音節雙寫、去不發音 e、保留 y、w/x/y 不雙寫等範圍。

教材明示 /ɪz ɪd/ 自然弱讀可近 /əz əd/；es 不代表永遠 /ɪz/，不把 goes 等例外作為本課題目。catches 標「第三人稱單數」，不稱複數動詞；-ed 只用規則動詞過去式，-ing 句子先示範 am／is，不把全部 -ing 一律定義成進行式。

## 接入與預覽

- 資料：`web-learner/src/phonicsInflectedLessons.ts`；四課已併入現有 `phonicsLessons`，共六章／29 小課。既有課程與播放行為保留。
- 新章節：[字尾變化](http://127.0.0.1:5174/#/phonics/endings)。使用 `npm run phonics:preview`，固定 127.0.0.1:5174；隔離正式 API／DB。小課可用 `#/phonics/endings-s`、`endings-es`、`endings-ed`、`endings-ing` 直接開啟，返回所屬章節。
- 最小資料適配：`PhonicsWord.inflection` 記原形／字尾／拼字說明，第二階段顯示原形→變化詞。不新增後台、DB schema、學習紀錄或收藏。
- 逐音與字形分開：x=/k s/ 算兩個 C；tch、ck、雙寫子音及 ng 各一個 C；es／/ɪd/的ed／ing 拆成母音與子音，不整塊誤標單一子音。making／riding 保留原形長母音。
- 新課詞組名稱是規則短語，使用兩欄正常文字尺寸；桌機與375px手機模擬已目視確認詞組及 making 的字形／原形說明可讀。其他裝置與完整逐課人工驗收未完成。

## 音訊實際狀態

- 初始需求 49 項＝33 整詞＋8 整句＋8 支援片語；49 個精確文字。正式字庫／文章候選及本機 data／教材 manifest 無可重用來源；初始盤點保存於 `audio-inventory-initial.json`。
- 本機已生成 49／49；既有重用 0、未盤點 0、待生成 0，沒有替換原課音檔。現行逐項狀態見 `audio-inventory.json`，來源候選見 `audio-sources.json`。
- 生成沿用 `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`、Serena、English；只用本機 `127.0.0.1:8000/v1/audio/speech`，未使用雲端付費生成。
- `web-learner/public/phonics/endings-{s,es,ed,ing}/manifest.json` 保存每項文字 hash、SHA-256、時長、原生成設定及來源；`audio-verification.json` 證明49項完整解碼、hash與近靜音初篩通過。
- 使用完整單字／自然整句／支援片語，沒有孤立音素或逐音拼合錄音；畫面不在開頁／播放時生成。
- **人工發音聽審待完成**：技術解碼不證明字尾 /s z t d ɪz ɪd ŋ/ 正確或整句自然，也未取得逐檔品質通過。

## 共用字庫實際狀態

- 正式唯讀快照 `wordbank-before.json`：english_learning／app，交易 `readOnly=on`；本批33屈折詞均無獨立正式詞條，沒有把音訊掛在不同拼字的原形GUID。
- 完整新增33詞（99解釋／99中英例句），level三欄全null，穩定source id／GUID與詞性／原形關係已核對。來源 canonical 已同步至9,243詞；正式唯讀基準仍9,203詞。
- `wordbank-additions.json` 僅本批33詞；`wordbank-phonics-mapping.json` 關聯33整詞及8個適用例句。正式唯讀 preflight 的231 GUID／source id衝突為0。
- `wordbank-audio-preparation.json`：33整詞＋8例句＝41個相同音檔已離線複製至 `data/phonics/endings/wordbank-audio/wordbank/...`，保留生成設定／SHA-256；`wordbank-audio-import.json` 通過 importer dry-run。其他91例句與99解釋的錄音不在本輪範圍。
- **未正式匯入、未寫正式音檔服務volume、未部署**；目前不能稱第二功能已可使用本批新詞音訊。詳見[字庫備料](wordbank-review.md)。

## 驗證

已執行的針對性驗證：

- 新教材音形／題目／短句內容測試11項通過；四階段、原形對照、切詞組、空結構篩選與字尾標色測試98項通過；章節／直接路由12項通過。
- 音訊／回補／隔離預覽工具19項Node測試通過，包含新批次白名單、隔離、路徑與原音保護。
- 字庫契約與完整9,243詞匯入／重匯測試21項通過；確認本批41素材歸屬正確、屈折詞GUID與原形不同、例句／hash正確。
- 詞條及音訊 importer `--dry-run` 均通過；不連正式庫。
- 本機產音／49檔實際技術驗證／41檔離線轉存已完成。
- `LC_ALL=zh_TW.UTF-8 npm test` 完整862項通過（shared 283、api 146、worker 17、admin 115、learner 301）；`npm run typecheck` 全workspace通過；learner build通過。
- 49個本機播放URL實際回傳audio，內容SHA-256全符合，`/me`回空使用者、字庫API回503，見 `preview-media-check.json`。Chrome手機模擬實際點播 making，MP3取得206 Partial Content並進入音訊播放狀態；不是逐檔發音聽審。

首輪完整測試發現舊章節總數固定25，更新為29；後續發現字庫總數固定9,210，更新為9,243。原章節順序、基本級數量、全欄位round-trip、重匯與完整性斷言保留，另增加本批內容／素材歸屬檢查。沒有降低測試要求換取通過。

## 操作與限制

```bash
npm run phonics:preview
node --import tsx scripts/prepare-phonics-endings.mjs --verify
npm run vocabulary:import -- docs/phonics/preparation/endings/wordbank-additions.json --dry-run
npm run vocabulary:audio:import -- docs/phonics/preparation/endings/wordbank-audio-import.json --dry-run
```

重新備料與產音指令見[試作說明](../../../phonics-prototype.md)。`--wordbank` 會同步本機來源JSON；`--snapshot／--preflight` 只做正式唯讀交易；生成需 `PHONICS_REAL_TTS=1` 明確opt-in。正式匯入要在當次授權後核對最新目標／衝突與備份，只用本批增量；不把製作教材視為push或部署授權。依 `AGENTS.md`，完成後先詢問使用者是否滿意，得到滿意回覆才commit。

## 獨立 read-back

fresh-context 代理已逐項核對33詞／32題／8句、49教材音檔與41離線字庫音檔的文字hash／SHA-256、canonical/GUID/source id、8句子項歸屬與52個本機Markdown連結；兩項importer dry-run重新通過。已修正初始音訊盤點檔名及架構現況數量，未發現其餘阻擋交付問題。該代理未另做瀏覽器操作或發音聽審，完整測試與UI證據採本紀錄的主代理實際結果。外部來源重查時BBC／UNAM可開啟，Iowa遇403、British Council逾時；沒有把來源抓取狀態當成教材品質通過。

測試用資料庫已用 `npm run test:db:down` 清理；隔離預覽保留供使用者檢視。尚未commit，等待依專案流程確認滿意。
