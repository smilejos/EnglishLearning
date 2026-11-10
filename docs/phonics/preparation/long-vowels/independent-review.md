# 五長母音獨立覆核

2026-11-01。由未參與教材與音訊製作的 fresh-context agent 唯讀覆核；唯一新增檔案為本報告。未呼叫真實 TTS／LLM、未連正式 DB、未寫服務 volume 或部署。

## 結論與範圍

教材內容、逐課文件、靜態音訊及共用字庫離線增量核對通過，未發現阻擋本機試作交付的內容或檔案錯配。這項結論不代表人工發音品質、所有 UI 流程、正式回補或部署通過。

覆核涵蓋 `phonicsLongLessons.ts`、既有短課資料差異、五份 `lesson.md`／五份 `review.md`、本批 JSON／音訊 manifests／字庫回補計畫，以及 `docs/phonics-prototype.md`、架構導覽的相關說明。

## 獨立實跑與內容證據

- 長 A／E／I／O／U 依序為 12／12／11／12／8 詞，共 55 詞、40 題、10 句；逐課皆有三示範、四選字＋四拼字及兩句。五短課資料未被替換，`phonicsLesson.ts` 僅新增型別欄位、匯入與課程附加；短課 public 目錄沒有本批 git 差異。
- 逐詞按明列音素重新計算 C／V，全部與結構相同；day／see／high 等為 CV，play／tree／snow 等包含 CCV。長 u 的 cute／mute／cube 含獨立 /j/，標 CCVC；美式 tube／tune／dune 分開教 /uː/，flute 保留 /f/、/l/。證據：`web-learner/src/phonicsLongLessons.ts:90`。
- 程式與逐課教材的拼法、字族、音素、中文義、順序與支援詞一致。不連續母音採兩個 targetRanges，拼字作答維持原拼寫；相連多字母字形採明確 spellingUnits。四十題答案均在本課，聽音選項只有一個相同音素序列，所有拼字題都有足夠作答塊；支援詞片語另有詞義與示範，沒有把後課規則當陷阱。
- 86 份前台 MP3 逐檔獨立重算 SHA-256、bytes、文字 hash，使用 ffprobe 核對實際時長，再用 ffmpeg 完整解碼。全部與各課 manifest 及 `audio-verification.json` 相符，零差異。來源共 42 重用、44 本機補缺；42 個重用來源檔 hash、原生成時間及 profile 保留，所有素材仍標 awaiting-human-listening。
- 23 份離線共用音檔逐檔與來源 hash 相同；13 整詞＋10 例句的 metadata 使用實際 `WordbankAudioManifestSchema` 與 `validateWordbankAudioManifest` 驗證通過。55 詞 entry GUID、10 句 asset GUID／文字／hash 皆與 canonical 相符。
- 使用實際 `parseWordbankDocument`／`mergeWordbankEntry`，將正式唯讀快照的 54 個既有詞與本批 11 筆增量離線合併，所得 55 詞逐筆等於 canonical。增量只有 dune 新詞、3 解釋、13 例句；本批不混入前批五短母音未入庫資料。canonical 獨立計數為 9,209 詞、27,666 解釋、33,013 例句，正式基準 9,203 詞另列。
- 逐課文件與批次文件明確區分需求、重用、本機新生成、技術驗證、待人工聽審、離線轉存及未正式匯入。正式計畫只含 11 筆詞條與 23 音 metadata，保留既有 42 整詞音；沒有宣稱第二功能已取得本批增量。證據：[字庫紀錄](wordbank-review.md)、[正式回補計畫](formal-write-plan.md)。
- 本批相關 17 份文件的 97 個本地 Markdown 連結已解析確認，零失效；逐課 review、技能參考、批次紀錄、預覽指令與靜態路由皆存在。`--batch long-vowels` 命令與工具實作一致，生成需明確 opt-in；預覽指令與正式回補操作有分開說明。
- 覆核發現的低嚴重度文件同步問題已由主線修正並再次讀取確認：架構導覽的來源／測試總量現為 9,209；試作文件將前批短母音 85 音與當時 9,208 詞標為歷史快照，並明列本批長母音 55 詞／86 音、目前 canonical 9,209、兩組教材及兩批 review。

## 主線結果 read-back

[主線整合驗證](review.md) 記錄全套 npm 測試 715 項通過（shared 280、API 146、worker 17、admin 115、learner 157），另四個 Node 工具套件 19 項通過；typecheck、learner build 及 diff whitespace 檢查通過。這些是主線實跑結果，本覆核沒有重跑全套或將它們算成獨立實跑。

新增測試可對照實際程式，包含全部五長課作答、音訊需求映射、不連續字形、多字母／重複塊、CV／CCV、空篩選與切換取消；字庫測試另涵蓋長母音增量合併／重匯及測試 DB 匯入。主線 UI 紀錄限定桌機長 A、十課總覽、手機長 E 結構篩選、長 I 前四題與長 U 的 cute／tube 結構切換等實際操作。長 U 的單詞播放／停止與媒體 206 證據只確認傳輸及播放狀態；文件明確保留全面 UI、真實連播及人工聽審，沒有冒稱十課完整驗收。

## 未解事項與嚴重度

- **中：人工聽審未完成。** 尤其長 u /j/ 有無、美式 tube／tune／dune、字尾與整句自然度，仍需能實際聽音的人逐項確認。解碼、hash、近靜音初篩與文件核對不能取代此項；目前適合本機試作，不據此標示品質可發布。
- **低：全面 UI 驗收仍未完成。** 本覆核未另開瀏覽器，採主線明列的指定畫面與操作證據；所有十課完整桌機／手機流程、全部鍵盤操作與原生連播仍列待辦。
- **狀態界線：正式回補與部署未執行。** 現有檔案與計畫是可審閱的離線成果，後續依既有正式寫入確認流程執行，不能當作已正式落地。

未發現尚未處理的高嚴重度程式／教材／檔案一致性問題。
