# 自然發音教材試作

> 2026-11-10：已完成共用 DB／audio volume／API 的正式搬遷與部署，447 段 Phonics 原靜態來源已移至可回復封存區；學習前台不再發布 MP3。`npm run phonics:preview` 現為連接既有 API 的唯讀預覽。新增與重製音檔只放在 `data/audio-preparation/phonics/` 備料，再經工具匯入。下方 public 路徑及隔離模式屬歷史製作記錄。目前狀態及操作以 [音訊存放與搬遷](audio-storage.md) 及 [正式紀錄](audio-migration-2026-11-10.md) 為準。

2026-11-02：新增第六章「字尾變化」，目前六章／29 小課。四課 `endings-s／endings-es／endings-ed／endings-ing` 共 33 詞、32 題、8 句；顯示原形→變化詞、字尾標色與完整逐音切分。本機 49 段錄音已備妥及通過技術驗證；人工發音聽審待完成，33 詞與 41 段共用音訊僅離線備好，未正式匯入或部署。詳見[本批驗收](phonics/preparation/endings/review.md)。

2026-11-02：第三至五章接入時共五章／25 小課。新章為子音混合 5 課、子音字母組合 7 課、r 控制母音 3 課，新增 137 課內詞次（134 個不同單字）、120 題、30 句。221 項音訊為 63 重用／158 本機補缺；技術驗證通過，人工聽審與完整手機驗收仍待完成，未部署。完整範圍與限制見 [本批紀錄](phonics/preparation/phonics-345/review.md)。

2026-11-01：前台第四入口保留五短母音（56 詞、40 題、10 句），另接入長母音 A、E、I、O、U。每課沿用四階段、八題與兩句；長母音新增拼法導覽、結構篩選、不連續字形與多字母作答塊，未部署。製作、音訊與驗證狀態分見 [短母音紀錄](phonics/preparation/short-vowels/review.md)、[長母音紀錄](phonics/preparation/long-vowels/review.md)。

## 預覽

```bash
npm run phonics:preview
```

開啟 [章節總覽](http://127.0.0.1:5174/#/phonics)，先選六個章節之一；前兩章「短母音／長母音」各有 a→e→i→o→u 五堂小課。章節路由為 `#/phonics/short-vowels`、`#/phonics/long-vowels`；章節返回總覽，小課頂端及最後階段返回所屬章節。既有小課仍可直接開啟：短課路由為 `#/phonics/short-{a,e,i,o,u}`；新長課為 `#/phonics/long-{a,e,i,o,u}`，例如 [長 A](http://127.0.0.1:5174/#/phonics/long-a)。5174 是固定埠，已佔用時不會另換埠。

完成長短母音後可接 [子音混合](http://127.0.0.1:5174/#/phonics/blends)、[子音字母組合](http://127.0.0.1:5174/#/phonics/digraphs)、[r 控制母音](http://127.0.0.1:5174/#/phonics/r-controlled)。各章亦可回總覽，小課返回所屬章節。

## 字尾變化

[開啟字尾變化章節](http://127.0.0.1:5174/#/phonics/endings)，依 -s → -es → -ed → -ing 學習。

| 小課 | 重點 | 詞／題／句 |
| --- | --- | --- |
| `endings-s` | 名詞複數 -s 的 /s z/，不增加音節 | 8／8／2 |
| `endings-es` | s／sh／x／ch／tch 後加 es，/ɪz/ 多一音節；也示範 catches 的第三人稱單數 | 8／8／2 |
| `endings-ed` | 規則過去式 /t d ɪd/，依原形最後聲音判斷 | 9／8／2 |
| `endings-ing` | /ɪŋ/；直接加、雙寫、去掉不發音 e、保留 y | 8／8／2 |

資料在 `phonicsInflectedLessons.ts`；屈折詞另有 `inflection`，畫面顯示原形與實際拼字提示。詞組按聲音／拼字規則整理，不假稱韻尾字族。es、/ɪd/ 的 ed、ing 均保留母音與子音的逐音字形；x 的 /k s/ 算兩個 C，雙寫字母和 ng 各一個 C。美式示範保留自然弱母音與閃音差異。

```bash
# 本批備料已存在；重新盤點不會生成或寫正式庫
node --import tsx scripts/prepare-phonics-endings.mjs --inventory
node scripts/prepare-phonics-lessons-audio.mjs --batch endings --reuse-only
# 僅在本批實際補音授權下 opt-in；已有有效音不重產
PHONICS_REAL_TTS=1 node scripts/prepare-phonics-lessons-audio.mjs --batch endings --generate
node --import tsx scripts/prepare-phonics-endings.mjs --verify
# 使用本批完整唯讀快照備料並同步本機 canonical
node --import tsx scripts/prepare-phonics-endings.mjs --wordbank
node scripts/prepare-phonics-wordbank-backfill.mjs --batch endings --prepare
```

`--snapshot`／`--preflight` 是明列的正式庫唯讀交易查核，不寫資料；其他模式只離線操作。字庫來源總量 9,243 詞，正式唯讀基準仍 9,203；正式匯入與部署尚未執行。完整詞表、教材來源、增量與驗收在[本批紀錄](phonics/preparation/endings/review.md)。

## 第三至五章

| 章節 | 小課 ID（依建議順序） | 課內詞次／題／句 |
| --- | --- | --- |
| 子音混合 | `blends-l`、`blends-r`、`blends-s`、`blends-final`、`blends-three` | 54／40／10 |
| 子音字母組合 | `digraph-sh`、`digraph-ch`、`digraph-th-voiceless`、`digraph-th-voiced`、`digraph-wh`、`digraph-ph`、`digraph-tch` | 55／56／14 |
| r 控制母音 | `r-ar`、`r-or`、`r-ore-oar` | 28／24／6 |

小課完整網址沿用 `#/phonics/<lesson-id>`。資料分別在 `phonicsBlendLessons.ts`、`phonicsDigraphLessons.ts`、`phonicsRControlledLessons.ts`；非母音課以目標拼法與詞組組織，不硬套韻尾字族。字形標色依本課目標；r 課的完整目標字形可對應母音與 /r/，/r/ 仍算子音，標籤顯示「母音＋r」。四階段、每課八題與兩句、播放取消與課內暫存行為沿用。

新章先備、照片來源、實際音訊與共用字庫離線狀態見 [本批 review](phonics/preparation/phonics-345/review.md)。本機備料指令：

```bash
node --import tsx scripts/prepare-phonics-345.mjs --inventory
node scripts/prepare-phonics-lessons-audio.mjs --batch phonics-345 --reuse-only
PHONICS_REAL_TTS=1 node scripts/prepare-phonics-lessons-audio.mjs --batch phonics-345 --generate
node --import tsx scripts/prepare-phonics-345.mjs --verify
node --import tsx scripts/prepare-phonics-345.mjs --wordbank
node scripts/prepare-phonics-wordbank-backfill.mjs --batch phonics-345 --prepare
```

只有明確 opt-in 的 `--generate` 會呼叫本機 TTS；其他命令不生成或寫正式庫。`--wordbank` 會同步本機 canonical 與增量。canonical 本批為 9,210 詞，正式唯讀基準仍為 9,203；106 份共用音訊增量僅備好，未正式匯入。

`scripts/preview-phonics.mjs` 使用唯讀同源 API proxy，`VITE_API_PROXY` 預設 `http://localhost:8080`；GET／HEAD／OPTIONS 連接既有 API，其他方法及舊 `/phonics/*.mp3` 音檔回 405。身分驗證與音檔位置均沿用既有 API，不回假使用者或本機音檔。API 與共用音訊 metadata 未準備好時，播放會明確失敗並允許重試。

## 五個短母音教材（保留）

| 順序／聲音 | 字族與實際詞數 | 短句 |
| --- | --- | --- |
| a /æ/ | -at 5、-an 5、-ap 4，共 14 | A cat sat.／A man sat on a mat. |
| e /ɛ/ | -en 4、-et 4、-ed 3，共 11 | Get a red pen.／The hen is on the bed. |
| i /ɪ/ | -ig 4、-in 4、-it 4，共 12 | The pig is big.／The pig can sit. |
| o /ɑ/（美式） | -op 4、-ot 4，共 8 | The pot is hot.／Hop to the top. |
| u /ʌ/ | -ug 4、-un 4、-ut 3，共 11 | Run in the sun.／The bug is on the rug. |

每課先以三個整詞認識聲音，再按字族完整逐音拼讀。進入第二階段選取第一字族第一詞，不自動播放。可點詞、正常速度、0.8 倍速及連播目前字族全部實際 N 詞；顯示同步選詞與進度，字間隔 650ms。切字族、改播單字、換題、換階段、切課、離頁或其他音源接手，均停止舊音訊與待播計時器；失敗停止佇列並可重試。無詞字族顯示空狀態。

第三階段每課八題，四題聽音選字與四題字母拼字交替；以第一次作答計本輪結果，可重聽錯詞、只重練錯題或全部重練。pop 的兩個 p 是獨立可操作字母塊。第四階段每課兩句，翻譯預設收合，可播整句、重點詞及支援片語，並自行朗讀核對。冠詞 a／the、can 的助動詞用法等另附詞義與片語示範，不當成本課未教規則的解碼考核。

練習僅存在當輪記憶體，離開第三階段即重設；不新增 DB、成績、麥克風／ASR、錄音評分或收藏。資料明列音素、字形、目標範圍及 CVC 標籤。短母音原詞表與音檔保留；本輪長課共用的 renderer 另增加結構篩選、多字母與不連續字形支援，見下節。原短 a 的貓／男子 SVG 保留，其他課使用母音字形，不沿用無關人物圖。

## 五個長母音教材

依 A→E→I→O→U 學習；每課先聽完整示範詞，再按拼法與字族比較，不把後課規則當前課考題。

| 課程 | 本課拼法／發音 | 教材 |
| --- | --- | --- |
| 長 A | a_e／ai／ay，/eɪ/ | [教材](phonics/preparation/long-a/lesson.md) |
| 長 E | ee／ea，/iː/ | [教材](phonics/preparation/long-e/lesson.md) |
| 長 I | i_e／igh，/aɪ/ | [教材](phonics/preparation/long-i/lesson.md) |
| 長 O | o_e／oa／ow，美式 /oʊ/ | [教材](phonics/preparation/long-o/lesson.md) |
| 長 U | u_e，分 /juː/ 與美式 /uː/ | [教材](phonics/preparation/long-u/lesson.md) |

第二階段按拼法→字族導覽，結構篩選預設「全部」；CV／CCV 詞仍可見。換拼法、字族或篩選先停止與取消待播，選新詞表第一詞但不自動播放；沒有符合詞時清除選取並停用播放。不連續 a_e／i_e／o_e／u_e 標出兩位置，保留完整原字順序；完整逐音序列另列。長 u 的 /j/ 是一個子音，因此 cube /kjuːb/ 為 CCVC，而美式 tube /tuːb/ 為 CVC，不能全標成同一種。

拼字作答可用 ai／ee／igh 等多字母塊，格數依 `spellingUnits`；不連續字形題仍按原拼字字母順序作答。重複塊有各自識別，不用文字當唯一 ID。每課維持八題與兩句，短句中的支援詞先提供詞義和片語示範。

新課音訊與共用字庫增量獨立於舊批次，詳見 [長母音製作紀錄](phonics/preparation/long-vowels/review.md)。以下命令預設只列計畫；`--reuse-only` 不呼叫 TTS，生成須本機 opt-in：

```bash
node scripts/prepare-phonics-lessons-audio.mjs --batch long-vowels
node scripts/prepare-phonics-lessons-audio.mjs --batch long-vowels --reuse-only
PHONICS_REAL_TTS=1 node scripts/prepare-phonics-lessons-audio.mjs --batch long-vowels --generate
node scripts/prepare-phonics-wordbank-backfill.mjs --batch long-vowels --prepare
```

最後一個命令只在離線目錄準備共用音訊與匯入 metadata，不寫正式 DB 或服務 volume。正式回補計畫、實際檔案驗證、人工聽審與桌機／手機驗收各自記錄；未聽審不稱發音品質通過，未正式匯入不稱第二功能已取得增量。

## 短母音既有音訊與共用字庫

前批短母音實際需求 85 項：56 整詞、10 整句、19 支援片語。41 項重用、44 項本機補製，均有文字 hash、檔案 SHA-256、時長、來源、原模型／聲線及待人工聽審標記；原短 a 的 22 檔 hash 保持不變，六個未使用的舊素材保留但不計本課需求。詳見 [盤點](phonics/preparation/short-vowels/audio-inventory.md) 與 [檔案核對](phonics/preparation/short-vowels/audio-verification.json)。沒有孤立音素或逐音拼合錄音；音檔解碼通過不等於教學品質通過。後續聲學初篩找出fed近全靜音並已用本機補製，兩個備料工具增加−60dBFS近靜音防護；85項均未完成實際發音聽審，見 [聽審限制與修正](phonics/preparation/short-vowels/listening-review.md)。

新工具以 [audio-plan.json](phonics/preparation/short-vowels/audio-plan.json) 為工作清單，以 [audio-sources.json](phonics/preparation/short-vowels/audio-sources.json) 保存已核對來源：

```bash
# 僅列計畫
node scripts/prepare-phonics-lessons-audio.mjs
# 只複製有效舊音，不呼叫 TTS
node scripts/prepare-phonics-lessons-audio.mjs --reuse-only
# 有缺件且已授權時才執行；可用 --lesson short-e 限定單課
PHONICS_REAL_TTS=1 node scripts/prepare-phonics-lessons-audio.mjs --generate
```

生成設定沿用本機 `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`／Serena／English；`PHONICS_TTS_ENDPOINT` 只允許本機 HTTP。工具保留有效檔、驗證來源 hash、使用 batch lock 並可續接；不同來源設定保留於 `sourceProfile`，不改寫成新生成設定。原 `generate-phonics-audio.mjs` 保留為舊短 a 範圍工具，其他課使用本批新工具。

共用字庫的離線來源已補 sat、ran、men、fed、cot 五詞，以及八個既有詞的新例句，短母音批次當時來源共 9,208 詞；接續長母音補入 dune 後，該批 canonical 為 9,209 詞；2026-11-02 再補 oar 後該批為 9,210 詞；字尾變化另補33詞後目前為9,243詞，正式 DB 基準仍為 9,203 詞。增量、GUID 與正式回補界線見 [字庫備料](phonics/preparation/short-vowels/wordbank-review.md)。未授權正式寫入前，不稱已供第二功能使用。教材預覽使用穩定識別映射向共用 API 查詢音訊位置，不在開頁／播放時生成；音訊存放方式以頁首 2026-11-10 更新為準。

## 驗證與接續

```bash
node --test scripts/preview-phonics.test.mjs scripts/prepare-phonics-lessons-audio.test.mjs
LC_ALL=zh_TW.UTF-8 npm test
npm run typecheck
npm run build -w @el/web-learner
```

2026-11-01 前批章節導覽調整時，完整 `LANG=zh_TW.UTF-8 LC_ALL=zh_TW.UTF-8 npm test` 730 項、typecheck、learner build 通過，四組 Node 工具測試另計 19 項。2026-11-02 五章接入後為 836 項、typecheck、learner build 與 21 項 Node 工具測試通過，該批證據見 [第三至五章紀錄](phonics/preparation/phonics-345/review.md)。桌機／手機指定操作、人工聽審及正式狀態分見 [短母音 review](phonics/preparation/short-vowels/review.md)、[長母音 review](phonics/preparation/long-vowels/review.md)。短課詳細教材在 `docs/phonics/preparation/short-a-word-families/` 與 `short-{e,i,o,u}/`，長課在 `long-{a,e,i,o,u}/`；五長課共 55 詞、40 題、10 句與 86 項音訊（42 重用、44 本機補缺）。製作新主題沿用 [phonics-lesson 技能](../.agents/skills/phonics-lesson/SKILL.md)，其參考檔若仍描述舊短 a 快照，當下實作與本批紀錄優先。
