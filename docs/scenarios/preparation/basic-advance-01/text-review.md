# 第一批其餘 39 場文字獨立驗收

審閱日期：2026-10-10。審閱者：fresh-context `verify_39_texts` agent。

## 結論

2026-10-10 再驗：39 場選詞、分級、原八詞保留、故事 token／GUID 關聯及人工文字對讀通過。前次 02／20／25 的問題已解決，27／34／37 的潤飾也已採用。本報告驗收文字；沒有圖片、定位、旁白或正式匯入品質結論。另附 Docker helper 與離線 native CLI 圖片 prompt 的靜態 read-back；前次 helper 的文件範例與猜測密碼問題已解決，prompt 的實體路標／回收圖形與泛稱禁箭頭規則需先消除歧義。

## 範圍與方法

- 先讀 `AGENTS.md`、`docs/codebase-architecture.md` 第 1–3 節與 `docs/scenarios/import-criteria.md`。
- 完整讀取 `author-02-14.json`、`author-15-27.json`、`author-28-40.json` 及三份對應 validation，逐場人工對讀英文、繁中、十五詞及視覺線索。
- 對原 `docs/scenarios/basic-advance-batch-01.json`、`source/vocabulary-database.json` 及 `data/scenario-preparation/basic-advance-01/formal-snapshot.json` 另行以 Python 標準庫重算，未直接採信作者 valid 旗標。
- 三份 validation 格式不同，分別正規化 `mappedTokens`／`tokenMappings`／`tokens`。15–27 更新後亦包含句內起訖；15–40 共 2289 tokens 的 sentenceIndex／start／end 均逐筆正確。02–14 共 1139 tokens 的作者 validation 仍沒有起訖；本次通過 token 順序與 GUID 關聯，正式套件中的完整範圍另行驗證。
- 僅讀本機檔案及寫入本報告；未連 DB、未呼叫 API、未生成圖片或 TTS、未改作者檔。
- 正式資料核對採快照時間 `2026-10-10T06:25:47.078Z`，資料庫名 `english_learning`；這是既有唯讀快照比對，不代表重新連線驗證當下正式庫。

## 獨立機械結果

| 項目 | 結果 |
| --- | --- |
| 編號與 scenarioKey | 02–40 共 39 場連續，39 個 key 唯一 |
| 每場十五詞 | 各 15 個不同字形及不同 GUID；合計 585 詞次 |
| 原八詞 | 39 場原 312 個 GUID 全部保留；原 word／teachingPos／senseZh 保留 |
| 級別 | basic 514／advance 71；來源與快照均一致，未加入 expert 或 null 分級 |
| 教學詞性 | n 343／v 105／adj 137；每場至少各一，來源與快照 parts_of_speech 均合法 |
| 故事 tokens | 3428 個，全數依原故事順序一對一有 GUID，來源與快照 word／級別相符 |
| 目標覆蓋 | 每場 15 個目標 GUID 均出現在映射；不是僅以表面字形判斷 |
| aliases | 全部是實際第三人稱、複數、be／have、進行形或比較級等屈折；無同義字替換、無 expert 改名洗入 |
| validation 對照 | 三組 token 順序與獨立重算一致；第二、第三組共 2289 tokens 的 sentenceIndex／start／end 範圍正確 |

特殊身分核對：

- 27 場 `fire` 目標及故事 token 使用 `2d70e332-919d-573f-a971-07fea2cec030`（basic 火），沒有錯配來源未分類的 `FIRE`：`0ac4d87d-a797-5c3b-bfb0-081e14bd7caf`。快照沒有未分類 FIRE 不影響本場。
- `shoe`：`cc6ba09c-72ff-5c1f-8b49-08f6c7125745`；獨立 `shoes` 詞條：`43f36544-8a50-5558-9dc2-4de8d7773649`。30 場 shoes 明確 alias → shoe，validation 實際使用目標 shoe GUID，未因 exact shoes 優先而漏掉 shoe 覆蓋。10／14／21 場使用單數 shoe 亦正確。
- 35 場 glass 的故事為名詞作材質修飾（glass bottle），符合本次「玻璃」；09／13 場 glass 為玻璃杯，分別有對應語境。35 場 can 的容器名詞與末句情態動詞可共享既有同 GUID，教學目标名詞在前句確有覆蓋。18 場 plant 與 38 場 water 的動詞教學亦有實際動詞位置。

## 修正後再驗

| 場次／位置 | 現有修正 | 再驗結論 |
| --- | --- | --- |
| 02，hot 目標／reviewNotes；author-02-14.json:62、173 | 保留現有 `The pan is hot, so I stand back and watch.`，視覺線索改為平底鍋上方的蒸氣，明確指向熱鍋。 | 解決前次主體不一致。蒸氣只是熱的線索，故事／教學意思已一致；不等於我已驗收圖片上的蒸氣或標籤位置。scene-02.json 與作者場次物件完全相同；英文未改，不需因本項改故事文字 hash 或重做現有旁白。 |
| 20，第 3 句；author-15-27.json:1006 | `A bottle of water is in a side pocket of my backpack.`／「我的背包側袋放著一瓶水。」 | 文法自然且中英相符。新增支援詞 pocket 是 basic，GUID `ca3d6bac-637a-5873-b404-6081320f7076`；來源與快照匹配，新增 token 與句內範圍正確。 |
| 25，follow 目標；author-15-27.json:1842 | senseZh「沿著」，線索「孩子沿著通往橋的寬道路前進，故事補足沿路方向。」 | 與第 4 句 follow the wide road 一致。 |
| 27，第 3 句；author-15-27.json:2216 | `A green tree stands near our tent in the evening light.`／「傍晚光線中，一棵綠色的樹矗立在帳篷旁。」 | 時間與晚餐段落更流暢，支援詞 evening／light 與原目標覆蓋通過。 |
| 34，第 2 句翻譯；author-28-40.json:1245 | 「騎自行車穿過公園後，一個圓形車輪弄髒了。」 | 自然繁中；英文未變。 |
| 37，第 5 句翻譯；author-28-40.json:1812 | 「一隻斑馬在獅子附近的另一區吃草。」 | 中英逐句對應；英文未變。 |

全部故事文法與繁中大意可接受，物件、動作與情境自然；形容詞的感受／速度／重量／新鮮及抽象動詞仍依文件要求以故事輔助，不能只靠靜態線索當成媒體驗收。改了英文故事的場次，後續應以定稿產音並綁定文字 hash；本 agent 沒有讀取或試聽音檔。

## 逐場摘要

| 場次 | 標題 | basic／advance | n／v／adj | token 數 | 人工文字審閱 |
| --- | --- | --- | --- | --- | --- |
| 02 | 廚房準備早餐 | 14／1 | 9／2／4 | 87 | 修正後可接受 |
| 03 | 家庭一起用餐 | 15／0 | 9／3／3 | 84 | 可接受 |
| 04 | 整理臥室 | 13／2 | 9／2／4 | 88 | 可接受 |
| 05 | 洗衣與曬衣 | 14／1 | 10／2／3 | 88 | 可接受 |
| 06 | 課堂小組活動 | 14／1 | 10／2／3 | 89 | 可接受 |
| 07 | 圖書館找書與借書 | 12／3 | 7／4／4 | 89 | 可接受 |
| 08 | 美術課畫畫與剪貼 | 13／2 | 9／2／4 | 87 | 可接受 |
| 09 | 測量與混合的科學小實驗 | 12／3 | 7／2／6 | 88 | 可接受 |
| 10 | 校園運動會 | 13／2 | 9／2／4 | 87 | 可接受 |
| 11 | 超市挑選水果 | 15／0 | 8／3／4 | 88 | 可接受 |
| 12 | 麵包店剛出爐 | 13／2 | 7／3／5 | 90 | 可接受 |
| 13 | 咖啡店點餐與上飲品 | 13／2 | 10／2／3 | 86 | 可接受 |
| 14 | 服飾店試穿與挑選 | 14／1 | 8／2／5 | 88 | 可接受 |
| 15 | 傳統市場買菜 | 14／1 | 7／4／4 | 80 | 可接受 |
| 16 | 公園散步遛狗 | 13／2 | 7／4／4 | 81 | 可接受 |
| 17 | 遊樂場玩耍 | 12／3 | 8／2／5 | 82 | 可接受 |
| 18 | 花園種植與澆水 | 14／1 | 9／3／3 | 85 | 可接受 |
| 19 | 海邊玩沙 | 13／2 | 9／2／4 | 82 | 可接受 |
| 20 | 山林健行與休息 | 12／3 | 8／3／4 | 86 | 修正後可接受 |
| 21 | 雨天等公車 | 14／1 | 10／2／3 | 84 | 可接受 |
| 22 | 火車站準備出發 | 13／2 | 9／3／3 | 84 | 可接受 |
| 23 | 機場登機門前 | 14／1 | 9／3／3 | 87 | 可接受 |
| 24 | 抵達飯店客房 | 14／1 | 10／2／3 | 89 | 可接受 |
| 25 | 城市街口問路 | 14／1 | 8／4／3 | 87 | 修正後可接受 |
| 26 | 草地上的野餐 | 15／0 | 10／3／2 | 82 | 可接受 |
| 27 | 湖畔露營煮餐 | 14／1 | 11／2／2 | 87 | 修正後可接受 |
| 28 | 河畔自行車出遊 | 13／2 | 9／2／4 | 95 | 可接受 |
| 29 | 泳池練習踢水 | 14／1 | 9／3／3 | 84 | 可接受 |
| 30 | 球場投球練習 | 12／3 | 9／4／2 | 102 | 可接受 |
| 31 | 生日派對吹蠟燭 | 14／1 | 8／4／3 | 89 | 可接受 |
| 32 | 搬家搬運家具 | 13／2 | 9／3／3 | 90 | 可接受 |
| 33 | 溫柔照顧寵物 | 13／2 | 8／3／4 | 93 | 可接受 |
| 34 | 自行車維修與打氣 | 11／4 | 9／2／4 | 94 | 修正後可接受 |
| 35 | 整理資源回收物 | 13／2 | 8／3／4 | 89 | 可接受 |
| 36 | 診間檢查喉嚨 | 13／2 | 12／1／2 | 95 | 可接受 |
| 37 | 動物園觀察動物 | 13／2 | 9／3／3 | 89 | 修正後可接受 |
| 38 | 菜園採收蔬菜 | 12／3 | 9／3／3 | 88 | 可接受 |
| 39 | 博物館古物與恐龍展 | 10／5 | 8／3／4 | 95 | 可接受 |
| 40 | 社區一起打掃 | 12／3 | 9／3／3 | 90 | 可接受 |

## 輸入檔指紋

下列為修正後本次再驗的 SHA-256；後續檔案變更須依新檔再驗。

- `docs/scenarios/preparation/basic-advance-01/author-02-14.json`：`6722ff542e9df4ad60ba7638f4b422cc747fdbfc772b0eb74caa5f982280c4be`
- `docs/scenarios/preparation/basic-advance-01/author-15-27.json`：`ec15191611c0a7427f1d8ac7d1bbc45af68f9b10d1644b92bcf6703a0df757ca`
- `docs/scenarios/preparation/basic-advance-01/author-28-40.json`：`e92eb1efef433cf4ab891da0a52390da52d9ce7b76d3859a929dc4eadbd9b3b1`
- `docs/scenarios/preparation/basic-advance-01/author-02-14-validation.json`：`904770081b9e8ec55014a6ce0b93289e127023fab88be5cdc2006c0d05475bd5`
- `docs/scenarios/preparation/basic-advance-01/author-15-27-validation.json`：`5fdc254e1384cd73af1db2636723fbc84a016e7af2eb0ad29739aa39371a4823`
- `docs/scenarios/preparation/basic-advance-01/author-28-40-validation.json`：`bcbabbff558fa604a5126a666e6888f89315dd8380f57a024f1866b51c38fb23`
- `docs/scenarios/preparation/basic-advance-01/scene-02.json`：`c3bcfe43367e53a289e50622ef8d14d6ea9834be4b45f439ead685cbbad29a9e`
- `docs/scenarios/basic-advance-batch-01.json`：`8a52da5b2dd94207e6021e355dce0472c517d6f5b1726c5a023bf4d6c673bbfd`
- `source/vocabulary-database.json`：`7df89d8abab18348a0acbfe5720c108a7a2b54057e6aee22f9d488dc37b446ea`
- `data/scenario-preparation/basic-advance-01/formal-snapshot.json`：`dfece701741ba139c2de79f205670c44cadd9d46ab6e311d1a05836de14c847a`

## 正式套件未驗收項目

本 agent 仍未驗收各場 Codex CLI 無字圖片、逐詞實測座標、local TTS Serena 故事旁白／文字 hash、目標字庫實體音檔與正式 metadata、完整解碼／播放試聽、圖片與桌機／手機互動、套件 check／dry-run、指定 draft revision 匯入與權限；此處不判斷媒體是否已由主 agent 備妥。主 agent 告知 02 已有底圖、座標與旁白，但本次文字再驗沒有把這些當作媒體通過證據。作者檔的來源查核文字仍是作者原當時範圍；本報告另補了快照比對。

本 agent 未做生成／DB 寫入／匯入，也未執行 npm test 或 typecheck；僅獨立審閱文字、helper、prompt 並做 Node 語法檢查。不能把本次機械通過或作者 valid 旗標宣稱為正式套件 publishReady、可發布、已匯入或使用者要求的 39 場完整完成。

## Docker draft helper 靜態 read-back（修正後）

範圍：完整只讀 `scripts/scenarios/README.md`、`docker-import.mjs`、`docker-import-task.mjs`、`import-safety.mjs`、`import-safety.test.mjs`；追讀既有 `scripts/import-scenario.ts`、`scripts/import-vocabulary-audio.ts`、`scripts/check-scenario-package.mjs`、`shared/src/wordbankAudio.ts`、`shared/src/repo/scenarios.ts` 與 `api/Dockerfile`。未執行 Docker、匯入 CLI、DB 或生成，也未修改 helper。

| 項目 | 靜態結論／證據 |
| --- | --- |
| 單場、明示 task | `import-safety.mjs:6` 只接受五個 task，必須有單一 --package，拒絕重複／未知參數；copy-audio／audio-metadata 必須有 manifest。 |
| 套件 schema | `docker-import-task.mjs:25` 先用原套件 validator 要求完整，接 ScenarioContentSchema；WordbankAudioManifestSchema 與正式來源字庫逐項驗證（:34、:68）。 |
| 正式目標 | `docker-import.mjs:24` 限定 localhost／db:5432/english_learning；容器內 `docker-import-task.mjs:50` 以 READ ONLY 核對實際 DB 名稱、IP、port、migration、字庫與目前 revisions／pointer，符合 README 的固定目標。 |
| volume／readonly | `docker-import.mjs:26` 先查 API 實際具名 volumes。check／postcheck／audio-metadata 的媒體均 readonly；copy-audio 只有 audio 可寫；scenario 的指定媒體 volumes 可寫。來源 bind mounts readonly，容器 root readonly，僅 tmpfs /tmp。 |
| 混合擁有者 | `docker-import.mjs:31` 僅 copy-audio／scenario 指定 root 0:0 和 DAC_OVERRIDE；先 drop ALL、再 add 唯一此 capability，與文件一致。沒有 chmod／chown 或改 volume 既有權限。DAC_OVERRIDE 不能解除 readonly mount，因此來源及 rootfs 仍受 readonly 保護。 |
| 不生成、不部署、不發布 | `docker-import.mjs:30` 只一次性 run 既有 image；沒有 build／Compose up／生成 client。scenario 分支 `docker-import-task.mjs:128` 呼叫既有 importer apply；`shared/src/repo/scenarios.ts:56` 固定新建 draft。 |
| 既有發布版 guard | `docker-import-task.mjs:72` 任何 published pointer 或非 draft revision 都停止，所有 task 均受此 guard。這是首次 draft 工具。 |
| manifest 單場 | `import-safety.mjs:19` 限 entryGuid 為本場十五詞且 assetGuid 不重複；同場缺音子清單可用，別場獨有字資產拒絕。`docker-import-task.mjs:68` 另對正式字庫驗證文字、hash、種類、GUID 與檔名。 |
| 音檔來源與複製 | `docker-import-task.mjs:79` 以 manifest 目錄為來源，先核對 bytes、ffmpeg 完整解碼及既有檔案 hash；`import-safety.mjs:35` 排他建立，相同位元組重用，不同內容／symlink／traversal 拒絕；metadata 前確定檔案已到 volume。 |
| postcheck | `docker-import-task.mjs:130` 查指定 draft、發布時間、canonical content 與內容 hash、媒體 hash、字庫關聯與全部目標有效錄音；不是前台或試聽驗收。 |
| 憑證讀取／輸出 | `docker-import.mjs:15` 捕捉既有 API inspect stdout，不外傳；:19 取顯式 DATABASE_URL 或 API 的 DATABASE_URL，無可用 URL 時才用已提供 POSTGRES_PASSWORD 組連線；不再預設 app 密碼。URL 以 subprocess env 傳遞，Docker argv 只有 DATABASE_URL 名稱，無讀 `.env`；子 CLI stdout／stderr 與 catch 遮蔽 PostgreSQL URL（`docker-import-task.mjs:20`、:142）。 |
| 文件範例 | README 已改尚未發布的 breakfast-kitchen revision 1 套件與單場 manifest。本次讀檔核對：兩檔存在，套件 status draft；manifest 共 7 個資產，均屬本場目標且 assetGuid 唯一；manifest 相對來源檔全部存在。不代表已執行範例或核對當下正式 DB。 |

前次兩項已解決：客廳不再作首次 draft 操作範例；不再猜測 app/app 密碼。小項：實作憑證優先序為「顯式 DATABASE_URL → 既有 API DATABASE_URL → POSTGRES_* 環境」。即使提供 Compose 環境憑證，只要 API 已有 URL 就採 API；README 可明寫此實際優先序，避免誤以為所有環境指定都優先。

媒體／DB 狀態仍是實跑項目。固定 IP／volumes 與目前文件一致，但如 Docker 重建應重新查核；本 agent 沒有以靜態 read-back 宣稱正式環境仍是這個 IP。工具不建立或驗證備份，亦不代替同次有效備份、人工試聽、桌機／手機與權限驗收。

## Native CLI 圖片 prompt 靜態 read-back

完整只讀 `scripts/scenarios/prepare-codex-image-prompt.mjs`，沒有執行它的寫檔或生成工作。

- 僅用 Node 標準庫，`03–40 [--check]` 參數可從專案根目錄使用；02 明確保留既有 prompt。三份作者檔讀取與 SHA、39 場唯一 key／id、十五詞 GUID／級別／合法詞性、原八詞保留及 n／v／adj 均在產提示前檢查（:13–35）。
- 一次只組合指定場，文字來自本場 targets／description／sentences，不使用預設坐標；不引用 DB client、LLM、TTS 或 HTTP API（:37–40）。
- prompt 指明只呼叫一次原生 image_generation、失敗停止、不自行重試／改供應商；不讀憑證、不修改故事、不碰 DB、不啟服務；base.png 已存在時要求停止，依實際工具來源複製原圖（:41–45）。
- 提示要求真正目視後才寫審閱 JSON，實際尺寸與每詞 object／label；缺可靠線索填 null 和 issue，不得編造坐標、假稱十五詞清楚或把圖審閱當匯入驗收（:56–59）。
- `--check` 不 mkdir／write；寫入提示用 `flag: wx` 排他建立，不覆寫既有 codex-prompt.txt（:61–65）。base.png 不覆寫是給執行 agent 的明確指令，腳本本身不產圖，也未自行檢查或寫 base.png。

待消除的提示歧義：`:52`／`:53`／`:55` 泛稱禁止 arrows／signage，可能連場景的實體物件一起禁掉；25 場 sign 的原線索正是「箭頭形路標」（author-15-27.json:1778），35 場 recycle 的原線索是「循環箭頭圖形的回收容器」（author-28-40.json:1355）。請改為禁止疊加的答案／註解箭頭及帶文字的標誌，明確允許這兩種原目標所需的無字實體路標形狀、回收圖形；保留禁單字、翻譯、數字與所有可讀文字。這是生成前的規則一致性問題，不是圖片實際缺件結論。

## 本次驗證與主 agent 測試回報

本 agent 實際執行三項純語法檢查並通過：

```text
node --check scripts/scenarios/docker-import.mjs
node --check scripts/scenarios/docker-import-task.mjs
node --check scripts/scenarios/prepare-codex-image-prompt.mjs
```

Node --check 不執行腳本主流程。本次另外用 Python 讀 JSON 核對 README 範例及單場 manifest scope／來源存在，沒有 DB、Docker 或生成呼叫。

主 agent 回報：預設 locale 的 npm test 因中文排序失敗；`LC_ALL=zh_TW.UTF-8 npm test` 全綠，`npm run typecheck` 通過。此處保留預設指令失敗事實；本 agent 沒有重新執行或獨立核對測試 log，不能把主 agent 回報表述為我實跑驗證。

修正後 helper／prompt read-back 檔案指紋：

- `scripts/scenarios/README.md`：`2c8ac67d57ba81ef869c827e018afd31383b155b17f417f04fa11083dc8c7824`
- `scripts/scenarios/docker-import.mjs`：`1bbd772d81412a66a9110b0b24ce4d9201a9813bfa657f885245c73ec481f8f1`
- `scripts/scenarios/docker-import-task.mjs`：`c8c0d9107cd7366754e371176d212ca9d02901db5e510364c1ab548407d6a5c1`
- `scripts/scenarios/import-safety.mjs`：`3c7114400f099e1ccc4ffbcc0d7e995c3856cb435ebc6433379a2e5811d7a1c5`
- `scripts/scenarios/prepare-codex-image-prompt.mjs`：`2b4abe7f509341dfbb9685d3ec7f3601da826b2d29bb9599e46fc8cc045c7aaa`
