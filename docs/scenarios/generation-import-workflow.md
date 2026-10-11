# 情境教材：產生與匯入流程

> 2026-10-10 正式查核更新：客廳 `living-room / 1` 已匯入正式 DB，並依使用者「直接發佈」指示轉為 **published**，一般情境清單可見；十五詞 120 段字庫錄音有效（含既有 advance 27 段 metadata／檔案匯入）。正式庫已存在兩個情境 migrations，既有服務可由一般情境入口開啟客廳；該次查核沒有 migration、部署、啟動生成服務或重新生成。實際結果及未完驗收見 [匯入紀錄](packages/living-room-15-v1/import-review.md)。

更新日期：2026-10-11。現行套件、API 與後台生成契約接受 1–25 個目標詞，`targetCount` 與實際詞數一致。15 名詞＋5 形容詞＋最多 5 動詞是選詞目標，必須貼合底圖；動詞線索不足可以少選，不為配額塞詞。舊十五詞 revision 1 及其 hash 保留，不改寫成新教材。

## 01–09 revision 2 修訂流程

本輪九場已完成正式 draft 匯入及本機桌機／手機驗收，復用九張原無文字底圖，生成 9 個新版全文英文旁白，僅補正式字庫缺少的 84 段目標詞錄音。每場 15 名詞、5 形容詞，動詞依序 4、2、4、3、4、4、5、4、3，合計 213 個目標詞次。最新版除 07 圖書館／09 科學實驗為 revision 3，其餘為 revision 2；兩篇 revision 3 僅修正座標，不重產圖片或錄音，原 revision 2 保留。所有新版均為 draft，原 revision 1 的 hash／狀態／發布指標保持，客廳 `living-room` 仍發布 1，其餘未發布。本輪未部署或發布新版，完整人工試聽及正式 learner 角色端到端驗收尚未完成；備份完整解析通過，未做實際還原演練。結果見 [九篇修訂驗收](preparation/basic-advance-01/revision-02-import-review.md)。

故事可用 optional `story.paragraphBreakAfterSentenceIds` 讓中英文字同步呈現為兩個相連短段；全文 `textEn`／`textZh` 保持連續，旁白仍是一個完整英文 MP3，不拆音軌。分段 ID 必須是既有非末句且不可重複；前台依故事句序分段。舊版省略欄位維持原格式及 hash。

看圖學習顯示全部目標詞。看圖回想的名詞／形容詞／動詞開關依本場實際詞性顯示，獨立揭曉、累加或收起，也可全部揭曉／收起；查詞限已揭曉詞。全部目標詞揭曉前不開放故事、翻譯及旁白；收起任一已揭曉類別時關閉故事並暫停旁白。

單場修訂 helper、唯讀 `snapshot --output`、`--baseline` 保護及備份核驗指令見 [scripts/scenarios/README.md](../../scripts/scenarios/README.md)，品質準則見 [逐一匯入準則](import-criteria.md)。本輪不恢復歷史 03–40／06–40 revision 1 序列：10 已產圖等待 image gate，11–40 未開始，既有暫停與 gate 保留。

## 歷史客廳 revision 1 交付範圍

先讓一個情境完成「看圖 → 聽英文故事 → 點選單字卡 → 隱藏標籤回想」，確認畫面密度、故事長度與點選方式，再擴展其餘情境。聽音找圖、練習紀錄與整批自動生成留待試點後安排。

| 項目 | 客廳試點現況 |
| --- | --- |
| 十五個目標詞 | 已比對來源字庫 GUID、分組、詞性與本次詞義：basic 12、advance 3 |
| 效果參考圖 | 已產生，保留原八詞版；英文標籤仍畫在圖片內 |
| 英文故事與繁中翻譯 | 已整理草稿：8 句、75 個英文單字，涵蓋全部十五詞 |
| 故事點字資料 | 保存所有字形位置與字庫 GUID，屈折字形明確連回原詞 |
| 唯讀套件預檢 | 已實作；可檢查來源關聯、故事覆蓋、座標格式、檔案 hash 與缺件 |
| 正式底圖、互動位置、英文旁白 | 底圖目視覆核通過；十五組座標已通過桌面／手機本機 QA；Serena 旁白已生成 31.896 秒，完整人工試聽待補紀錄 |
| advance 補音 | curtain／shelf／pillow 共 27 段全部生成成功；2026-10-10 正式字庫 metadata／volume 已匯入 |
| 資料庫匯入、API、正式學習頁 | 已實作，客廳正式 revision 1 已匯入、預覽並發布；完整後台部署驗收另確認 |

[客廳套件與故事](packages/living-room-15-v1/README.md) 是第一輪的內容起點；[scenario.json](packages/living-room-15-v1/scenario.json) 是離線格式。`scenario:import` 將其轉為正式 content／media 契約，API `POST /scenarios/import` 接受該契約，不直接接受整份離線套件。

## 1. 先確認故事與選詞（歷史試點與現行規則）

使用 `level.list` 的 basic／advance 聯集選詞；歷史客廳 revision 1 的十五詞與支援詞均已比對來源檔。每個目標詞保存 `entryGuid`、`word`、`list`、`teachingPos` 與 `senseZh`，讓圖、故事和單字卡共用同一詞條。

故事採英文朗讀，繁中翻譯以文字展開，不另做中文朗讀。`reads → read`、`sleeps → sleep`、`books → book` 等關聯保存於逐句 `wordLinks`；單字卡播放的是原形單字錄音。預檢會核對字形範圍及 GUID，但不判斷字形與原詞是否為正確文法關係，仍須人工審閱故事、翻譯、詞義及畫面是否一致。

故事定稿後再產音，避免文字改動造成重做。使用者已確認旁白沿用字庫的本機 Qwen3-TTS／Serena，採溫暖、清楚的英語老師語氣；不要在測試時呼叫真實生成服務。

## 2. 準備無文字底圖與互動標籤

已確認的十五詞圖可以作為風格與構圖參考，但圖上的文字無法由網頁開關隱藏。已完成[同構圖的正式無標籤底圖](../../output/imagegen/living-room-base-2026-10-09-v1/README.md)，正式 App 已實作疊加英文標籤、指向位置與點選入口。

套件的 `generationPlan.baseImage` 已保存十區塊編輯提示詞與生成紀錄。底圖已目視核對十五個概念、動作與舒適感線索；英文標籤與箭頭已清除，未見可辨識文字。持書背封仍有淡色裝飾短線，無可辨識英文。

已為每詞記錄標籤位置 `interaction.label` 與指向位置 `interaction.object`，x／y 均使用 0–1 的圖片比例座標，供不同螢幕尺寸定位。動詞指向動作，形容詞指向孩子的放鬆姿勢；read／book、sleep／pillow 共用畫面區域時，以圖上標籤或故事字形點選區分。第一版採可點選標籤及標記，不要求先描出每件物品的完整輪廓。座標已在 `_test` 正式 App 完成桌面／手機 QA；未見標籤互遮，手機放大查詞及關閉返回正常。

使用者已取消圖下十五詞清單，改由圖片或故事點字開啟浮在圖片上方的單字 Modal；手機先放大圖片再點標籤。故事由「放大圖片」旁按鈕開啟，不常駐顯示。現行回想模式按詞性揭曉英文標籤及單字卡，全部目標詞揭曉後才開放故事及翻譯；目前燒字參考圖預覽不提供回想模式。

## 3. 準備旁白與核對已有字庫音檔

已生成一段完整英文故事音檔（Serena，31.896 秒），與既有單字、英文解釋、英文例句錄音分開，完整人工試聽待補紀錄。`assets.storyAudio` 保存路徑、檔案 hash、時長與聲線；`textSha256` 綁定故事，文字修改後預檢會拒絕舊旁白 metadata。

basic 原有音檔優先沿用，仍要核對實際檔案與 metadata。advance 的 curtain、shelf、pillow 已全部生成：3 段單字、15 段英文例句、9 段英文解釋，共 27 段，manifest 在 `data/scenario-wordbank-audio/living-room-v1/manifest.json`；2026-10-10 已匯入正式字庫 metadata 及 audio volume，未重新產音。只處理客廳試點，不重做整個 advance 字庫。

`npm run scenario:audio:generate` 預設只列 dry-run 計畫；經使用者明確授權實際產音後，使用 `SCENARIO_REAL_TTS=1 npm run scenario:audio:generate -- --generate` 呼叫本機 Qwen3-TTS。`npm run scenario:audio:test` 的六項測試使用假回應。一般驗證不產音。

故事、單字與例句接入既有音源仲裁：開卡不自動播放；播放單字或例句時暫停故事並保留位置，使用者可自行繼續聽故事。

## 4. 執行離線預檢

從專案根目錄執行：

```bash
npm run scenario:package:check -- docs/scenarios/packages/living-room-15-v1/scenario.json
npm run scenario:package:test
```

此工具不載入環境檔、不連資料庫、不產生圖片或音檔，也不匯入資料。本機素材齊備時為 `valid: true`、`publishReady: true`；音檔未隨 Git 提交，其他環境須另備本機素材。互動座標的實際呈現已完成桌面／手機 QA；2026-10-10 正式 draft 匯入及指定版本桌機／手機查核完成，完整人工試聽仍待補紀錄。

本機素材與座標齊備後，使用嚴格檢查：

```bash
npm run scenario:package:check -- docs/scenarios/packages/living-room-15-v1/scenario.json --require-publish-ready
```

缺件或不一致時回傳非零結束碼。`publishReady` 只表示套件欄位與檔案預檢通過，不代表圖片內容、音檔品質、正式字庫音檔或上線流程已驗收。圖片是否無文字仍依人工審閱標記，工具沒有 OCR；音檔是否真的朗讀該故事也須實際聆聽。座標、詞形與翻譯的語意品質不能單靠結構檢查判定。

## 5. 匯入、API 與學習頁

`1791504000000_scenarios.sql` 已定義獨立情境、不可覆寫的 revision 及字庫關聯。匯入只建立 draft：相同 key／revision 與內容可重跑，不同內容須增加 revision；驗證 GUID、本場全部目標詞覆蓋、媒體 hash／格式與安全路徑，失敗回滾，僅清理本次新增媒體。COMMIT 結果不明時重新取得同一把鎖並查 revision；已提交或無法確認則保留媒體，避免誤刪。先在 `_test` 驗證，不用文章 seed 或 POST /articles 代替情境匯入。

`GET /scenarios`、`GET /scenarios/:key` 提供目前發布內容；指定 revision 的詳情及媒體路由供 admin 查草稿、reader 查已發布版本。匯入及 `POST /scenarios/:key/revisions/:revision/publish` 限 admin；發布再驗證素材，匯入不自動發布。旁白使用受保護媒體路由，公共 `/audio/` 封鎖 `scenarios/`，不能繞過草稿權限。

`GET /wordbank/entries/:guid` 已提供指定字庫詞條與有效音檔。正式 App 的 `#/scenarios`／`#/scenarios/living-room` 沿用字庫單字卡、故事 Modal 與音源仲裁，提供看圖學習／回想；回想按詞性開放已揭曉標籤與單字入口，全部目標詞揭曉前移除故事與翻譯入口。點字或播放不自動收藏，不虛構文章來源。QA 使用 API 5180、Vite 5181 與 `_test`，不改原 5174 獨立預覽。

從根目錄執行 `npm run scenario:import -- --dry-run` 可離線核對完整套件；`--check-database` 須明示 `DATABASE_URL`，唯讀核對實際資料庫與字庫。實際匯入需 `--apply --confirm-database '<URL主機:port/DB名>' --confirm-server '<實際IP:port/DB名>' --image-dir '<圖片volume目錄>' --audio-dir '<音檔volume目錄>'`；可用 `--package` 指定套件；`--apply` 不能與 dry-run／check-database 混用。此指令不讀 `.env`、不跑 migration、不啟動 worker、不自動發布。

正式寫入前，先完成旁白試聽、座標與桌機／手機 QA，再依 [AGENTS.md](../../AGENTS.md) 確認具體範圍：實際目標 DB 與備份、情境 migration、底圖／旁白 volume 落點與 draft 匯入、advance 27 段檔案及字庫 metadata 匯入、程式部署、指定 revision 發布。字庫 metadata 匯入器不複製音檔，須另安排 volume 落點。截至 2026-10-10，正式 migrations 已在實際庫查得，客廳 draft、底圖／旁白及 advance 27 段檔案／metadata 已匯入；該次查核沒有部署或啟動 worker，已依使用者授權發布客廳 revision 1。其餘操作不由預檢自動執行。

## 後台製作

2026-10-10 使用者確認後台第一版採完整製作範圍：選詞、設定風格、產圖、產音與發布。後台「情境製作」沿用現行 1–25 詞契約、GUID 關聯、不可覆寫版本及發布 API，並另外保存可編輯製作草稿、工作與候選素材。常用圖片設定有預設，十區塊 Prompt 收在進階設定；圖上英文仍由網站疊加。

操作及獨立 scenario-worker／媒體 volume 設定見 [情境製作後台](admin-studio.md)。後台使用專案的模型 API，與 Codex 效果圖生成入口分開。離線套件與匯入器仍可使用；新增後台不代表已對正式資料庫套 migration 或啟用生成 worker。
