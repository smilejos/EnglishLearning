# 五個短母音製作與驗收紀錄

2026-11-01。後續使用者認可教材並要求聽審；本環境無音訊感知能力，已改做85項聲學初篩、修正fed近全靜音並增加防護，**實際發音聽審仍未完成**。詳見 [本輪結果](listening-review.md)。

2026-11-01。使用者要求依 `$phonics-lesson` 製作短母音 A、E、I、O、U。教材文字、前台接入與本機音檔已備妥；**未正式回補字庫、未部署，完整人工聽審及完整手機驗收待完成**。

## 教材與順序

依 a → e → i → o → u，每課只教一個母音與單字母拼法，沿用已熟悉的單字母子音、由左至右逐音拼合。新子音先聽整字示範，不引入子音組合、多字母母音或靜音 e。字族依常用詞及實際份量安排，不湊固定配額；本批全部為 CVC 結構。

| 課程／聲音 | 字族與去重詞數 | 詳細教材 | 音訊需求（重用／本機補缺） |
| --- | --- | --- | --- |
| a /æ/ | -at 5、-an 5、-ap 4；14詞 | [保留原課](../short-a-word-families/lesson.md) | 19（16／3） |
| e /ɛ/ | -en 4、-et 4、-ed 3；11詞 | [教材](../short-e/lesson.md) | 17（7／10） |
| i /ɪ/ | -ig 4、-in 4、-it 4；12詞 | [教材](../short-i/lesson.md) | 17（6／11） |
| o /ɑ/ | -op 4、-ot 4；8詞 | [教材](../short-o/lesson.md) | 14（6／8） |
| u /ʌ/ | -ug 4、-un 4、-ut 3；11詞 | [教材](../short-u/lesson.md) | 18（6／12） |

五課共56個不同詞、每課三個聲音示範、八題（聽音選字／字母拼字交替）與兩句，共40題及10句。前課不要求解碼後課規則；必要支援詞以詞義與片語先示範，例如 a 的弱讀、can 作助動詞。短 o 的文字標註採美式 /ɑ/，避開 dog／log 的口音分歧；實際錄音口音適配仍須人工聽審。原短 a 詳細文件與歷史驗證保留，本批追加三段支援片語；它的舊歷史數量不取代本表。

## 接入與互動

- `phonicsLesson.ts` 提供五課、音素／字形／目標範圍、字族／CVC標籤與支援詞；保留短 a exports。`PhonicsLearning.tsx` 與 `App.tsx` 依課程資料顯示，路由 `#/phonics/short-{a,e,i,o,u}`，切課卸載重設並取消音訊。
- 看字拼讀進入第一字族第一詞，不自動播放；單詞、0.8倍速、目前字族全詞連播、同步選詞／進度、650ms間隔、字族切換／停止／改播／外部音源取消、播放錯誤停止後可重試均保留。無詞字族有空狀態，不讀不存在第一詞。
- 八題以第一次作答統計本輪，可回收字母、錯詞重聽、只練錯題與全部重練。pop 的兩個 p 使用不同塊識別，已實際測試完成作答。答案揭曉前不顯示中文正解或以播放標籤洩漏答案。
- 短句可播整句、重點詞及額外支援片語；中文預設收合，自行朗讀不冒稱自動評分。原短 a 插畫保留，其他課以對應母音字形呈現。
- 練習離開第三階段即重設，不新增跨次成績、收藏、麥克風／ASR、後台、API或DB結構。本輪不增加結構篩選，不宣稱長母音或多字母／不連續字形題型已通用化。

## 音訊：來源、檔案、聽審分開

需求清單見 [audio-plan.json](audio-plan.json)，共85個不同全文需求：56整詞、10整句、19支援片語。最終四種備料主狀態為：未盤點0、已確認重用41、已新生成44、待生成0。製作時的解碼盤點未發現失效候選；後續聲學初篩找出fed近全靜音並已補製，原失效檔另外留證、不累加需求數。沒有孤立音素或逐音拼合錄音。

- 重用先查字庫，再查文章／例句與既有教材；精確全文未找到其他候選的結果見 [other-source-candidates.json](other-source-candidates.json)。50個來源候選不等於50個播放需求，來源清單保留 [audio-sources.json](audio-sources.json)；盤點基準見 [audio-inventory.md](audio-inventory.md)。
- 本機已運行模型 `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`、Serena、English，沿用既有完整profile。44個缺件只呼叫本機服務，沒有雲端生成。每課manifest記原設定、文字hash、檔案SHA-256、時長、來源及 `awaiting-human-listening`。
- 實際85需求全數逐檔完整解碼、文字映射與SHA-256相符，原短 a 22檔hash全部不變，見 [audio-verification.json](audio-verification.json)。原六個非現行需求的舊素材保留，不加入85的分母。
- `prepare-phonics-lessons-audio.mjs` 預設dry-run、可限定課程、`--reuse-only`無TTS、真生成須opt-in且僅本機。有效既存檔若缺相符metadata或hash衝突，直接停止避免覆蓋；首來源無效時續查其他候選。工具回歸測試涵蓋上述行為與端點／路徑約束。
- **人工聽審未完成**：目標母音、字首／尾、額外音、聲線／口音適配、can等詞的示範用法與短句自然度仍須逐項聽審。檔案有效、能播放或TTS設定相同，均不代表品質已通過。

## 共用字庫：離線備妥，正式待確認

[字庫備料紀錄](wordbank-review.md) 詳列51既有GUID與5新詞sat／ran／men／fed／cot（id9213–9217），屈折形獨立於原形。`wordbank-additions.json`為13筆增量：5完整新詞＋8既有詞各加1例句；新增15段解釋、23個例句，保留原有非空內容與分級。canonical已同步9,208詞／27,663解釋／33,000例句；正式DB唯讀基準仍9,203詞／9,515音訊metadata，來源與正式狀態不可混稱。

[穩定映射](wordbank-phonics-mapping.json) 對應56整詞與10句，整詞asset GUID等於entry GUID，整句歸屬合適的例句子GUID，19片語留教材資產。正式34份既有整詞音metadata及volume檔hash相符，全部排除於增量；離線回補22整詞＋10例句共32檔，原音hash不變，單profile `09eeb3d17582e855`。檔案位於 `data/phonics/short-vowels/wordbank-audio/`；報告與可審閱metadata見 [wordbank-audio-preparation.json](wordbank-audio-preparation.json)、[wordbank-audio-import.json](wordbank-audio-import.json)。該data目錄為本機忽略產物，可用 `node scripts/prepare-phonics-wordbank-backfill.mjs --prepare` 從已追蹤教材音檔重建，不重新TTS。

文字、音訊importer dry-run及canonical對照均通過，32份離線目的檔與來源SHA-256／bytes相同。這些不等於正式落地。未執行正式INSERT／UPDATE／DELETE、audio volume複製、migration、seed、worker啟動或部署，第二功能尚未取得本批補件。具體確認範圍、目標、備份與防覆蓋步驟見 [正式寫入計畫](formal-write-plan.md)。

## 實際驗證與限制

- `LC_ALL=zh_TW.UTF-8 npm test`：698項全通過（shared278、api146、worker17、admin115、learner142）。初跑有兩個舊9203詞快照失敗；更新為真實9208並補增量保留／重匯測試後，全套重跑通過，沒有放寬斷言。
- `npm run typecheck`：全workspace通過。`npm run build -w @el/web-learner`：通過。
- 隔離預覽與兩個離線工具另有Node測試（與npm test分開）：`node --test scripts/preview-phonics.test.mjs scripts/prepare-phonics-lessons-audio.test.mjs scripts/prepare-phonics-wordbank-backfill.test.mjs scripts/phonics-audio-quality.test.mjs`；原14項全通過；本輪加聲學初篩3項後17項全通過（預覽3、備音5、字庫回補6、聲學3）。這些測試不呼叫真實TTS。
- learner測試涵蓋五課路由、切課卸載／音訊取消、各新課實際完成八題、答案隱藏、重複p、跨字族連播／取消、空字族與短句／支援片語映射；資料測試把audio-plan與實際可播放清單逐項比對，避免雙份資料漂移。shared用 `_test` DB驗證5新詞＋8既有詞增量和重匯，保留原文與分級。
- 原生Chrome桌機已實際看到五課總覽、E聲音／字族（4／4／3）及O聲音頁；手機DevTools Responsive已看到400px的O單欄聲音頁。原生工具回傳快取畫面、操作中斷與一次 `noWindowsAvailable`，390px設定與後續互動沒有可靠視覺完成證據，因此**不列完整手機、全五課目視、鍵盤或真實連播驗收通過**。
- 本機備音器修正後以 `--reuse-only` 全五課續接，85／85需求保留有效檔且沒有呼叫TTS；測試堆疊已用 `npm run test:db:down` 清理。
- 85音檔技術驗證完整；不將假Audio測試或ffmpeg解碼當成人工聽審。全五課桌機／手機完整流程、實際連播／支援片語播放及逐檔人工品質驗收仍待完成。
- fresh-context subagent已對教材、GUID／hash、路徑命令、音訊回補與正式狀態作read-back，工具缺口修正後再次核對；最終總文件read-back亦通過，52個相對連結有效、85項教材音檔與32份回補資料一致，無未結高／中問題；驗收者獨立重跑14項Node測試通過。

## 預覽與交付界線

`npm run phonics:preview` 已實跑並提供 [五課總覽](http://127.0.0.1:5174/#/phonics)，每課網址如 `http://127.0.0.1:5174/#/phonics/short-e`。預覽隔離正式API／DB；一般入口不會自動生成音訊。操作見 [試作文件](../../../phonics-prototype.md)。

目前可交付的是五課文字、前台接入、本機85項音訊及正式回補準備套件；正式字庫寫入、完整人工品質驗收、部署、commit與push分別記狀態。使用者後續已認可教材，並要求聽審；本輪已修正fed近靜音並保留發音待聽審狀態，依原Git規則提交已認可內容與修正。正式回補仍須針對本批具體增量獲明確執行確認，滿意本身不等於部署或push授權。既有未提交的AGENTS.md／.gitignore及情境截圖不屬本次改動，不併入提交。
