# 自然發音教材試作

2026-11-01：前台第四入口已提供短母音 a、e、i、o、u 五課，保留原短 a 教材。五課共 56 詞、40 題與 10 句，全部採單字母 CVC；未部署。完整製作、素材與驗證狀態見 [本批紀錄](phonics/preparation/short-vowels/review.md)。

## 預覽

```bash
npm run phonics:preview
```

開啟 [五課總覽](http://127.0.0.1:5174/#/phonics)，依序進入 `#/phonics/short-a`、`short-e`、`short-i`、`short-o`、`short-u`。5174 是固定埠，已佔用時不會另換埠。

`scripts/preview-phonics.mjs` 不載入正式 Vite 設定、不設 API proxy，強制同源 API base；`GET /me` 只回空使用者，其他既有 API 與非 GET／HEAD 請求回 503。只提供前台及本機靜態教材，不連正式 API／DB。首頁其他三個入口在此預覽的 API 未連線。一般 Vite dev 不具有這項隔離，不能替代此指令。

## 五課教材

| 順序／聲音 | 字族與實際詞數 | 短句 |
| --- | --- | --- |
| a /æ/ | -at 5、-an 5、-ap 4，共 14 | A cat sat.／A man sat on a mat. |
| e /ɛ/ | -en 4、-et 4、-ed 3，共 11 | Get a red pen.／The hen is on the bed. |
| i /ɪ/ | -ig 4、-in 4、-it 4，共 12 | The pig is big.／The pig can sit. |
| o /ɑ/（美式） | -op 4、-ot 4，共 8 | The pot is hot.／Hop to the top. |
| u /ʌ/ | -ug 4、-un 4、-ut 3，共 11 | Run in the sun.／The bug is on the rug. |

每課先以三個整詞認識聲音，再按字族完整逐音拼讀。進入第二階段選取第一字族第一詞，不自動播放。可點詞、正常速度、0.8 倍速及連播目前字族全部實際 N 詞；顯示同步選詞與進度，字間隔 650ms。切字族、改播單字、換題、換階段、切課、離頁或其他音源接手，均停止舊音訊與待播計時器；失敗停止佇列並可重試。無詞字族顯示空狀態。

第三階段每課八題，四題聽音選字與四題字母拼字交替；以第一次作答計本輪結果，可重聽錯詞、只重練錯題或全部重練。pop 的兩個 p 是獨立可操作字母塊。第四階段每課兩句，翻譯預設收合，可播整句、重點詞及支援片語，並自行朗讀核對。冠詞 a／the、can 的助動詞用法等另附詞義與片語示範，不當成本課未教規則的解碼考核。

練習僅存在當輪記憶體，離開第三階段即重設；不新增 DB、成績、麥克風／ASR、錄音評分或收藏。資料明列音素、字形、目標範圍及 CVC 標籤。本輪不新增結構篩選，也不代表長母音、多字母或不連續字形題型已接入。原短 a 的貓／男子 SVG 保留，其他課使用母音字形，不沿用無關人物圖。

## 音訊與共用字庫

本批實際需求 85 項：56 整詞、10 整句、19 支援片語。41 項重用、44 項本機補製，均有文字 hash、檔案 SHA-256、時長、來源、原模型／聲線及待人工聽審標記；原短 a 的 22 檔 hash 保持不變，六個未使用的舊素材保留但不計本課需求。詳見 [盤點](phonics/preparation/short-vowels/audio-inventory.md) 與 [檔案核對](phonics/preparation/short-vowels/audio-verification.json)。沒有孤立音素或逐音拼合錄音；音檔解碼通過不等於教學品質通過。後續聲學初篩找出fed近全靜音並已用本機補製，兩個備料工具增加−60dBFS近靜音防護；85項均未完成實際發音聽審，見 [聽審限制與修正](phonics/preparation/short-vowels/listening-review.md)。

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

共用字庫的離線來源已補 sat、ran、men、fed、cot 五詞，以及八個既有詞的新例句，來源共 9,208 詞；正式 DB 基準仍為 9,203 詞。增量、GUID 與正式回補界線見 [字庫備料](phonics/preparation/short-vowels/wordbank-review.md)。未授權正式寫入前，不稱已供第二功能使用。教材預覽使用靜態音檔及穩定字庫識別映射，不在開頁／播放時查庫或生成。

## 驗證與接續

```bash
node --test scripts/preview-phonics.test.mjs scripts/prepare-phonics-lessons-audio.test.mjs
LC_ALL=zh_TW.UTF-8 npm test
npm run typecheck
npm run build -w @el/web-learner
```

實際通過數、桌機／手機指定操作、人工聽審及正式狀態以 [本批 review](phonics/preparation/short-vowels/review.md) 為準。五課詳細教材在 `docs/phonics/preparation/short-a-word-families/` 與 `short-{e,i,o,u}/`。製作新主題沿用 [phonics-lesson 技能](../.agents/skills/phonics-lesson/SKILL.md)，其參考檔若仍描述舊短 a 快照，當下實作與本批紀錄優先。
