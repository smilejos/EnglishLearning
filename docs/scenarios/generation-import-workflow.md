# 情境教材：產生與匯入流程

更新日期：2026-10-09。使用者已選擇每張十五個目標詞，第一輪先做「午後客廳」一個完整試點。

目前已實作情境 migration、離線匯入器、API 與正式 App 的情境學習頁；底圖、十五組座標、Serena 故事音檔及三個 advance 詞的 27 段補音已備妥。正式版目前只在 `_test` 資料庫作本機 QA，旁白仍待使用者試聽、座標已通過桌面／手機本機 QA；尚未套用正式 migration、匯入正式情境或字庫補音 metadata，也未部署或發布。[獨立本機預覽](web-preview.md) 保留原燒字參考圖。

## 第一輪交付範圍

先讓一個情境完成「看圖 → 聽英文故事 → 點選單字卡 → 隱藏標籤回想」，確認畫面密度、故事長度與點選方式，再擴展其餘情境。聽音找圖、練習紀錄與整批自動生成留待試點後安排。

| 項目 | 客廳試點現況 |
| --- | --- |
| 十五個目標詞 | 已比對來源字庫 GUID、分組、詞性與本次詞義：basic 12、advance 3 |
| 效果參考圖 | 已產生，保留原八詞版；英文標籤仍畫在圖片內 |
| 英文故事與繁中翻譯 | 已整理草稿：8 句、75 個英文單字，涵蓋全部十五詞 |
| 故事點字資料 | 保存所有字形位置與字庫 GUID，屈折字形明確連回原詞 |
| 唯讀套件預檢 | 已實作；可檢查來源關聯、故事覆蓋、座標格式、檔案 hash 與缺件 |
| 正式底圖、互動位置、英文旁白 | 底圖目視覆核通過；十五組座標已通過桌面／手機本機 QA；Serena 旁白已生成 31.896 秒，待使用者試聽 |
| advance 補音 | curtain／shelf／pillow 共 27 段全部生成成功；正式字庫 metadata 尚未匯入 |
| 資料庫匯入、API、正式學習頁 | 已實作，只在 `_test` 本機 QA；正式庫寫入、部署與發布未執行 |

[客廳套件與故事](packages/living-room-15-v1/README.md) 是第一輪的內容起點；[scenario.json](packages/living-room-15-v1/scenario.json) 是離線格式。`scenario:import` 將其轉為正式 content／media 契約，API `POST /scenarios/import` 接受該契約，不直接接受整份離線套件。

## 1. 先確認故事與選詞

使用 `level.list` 的 basic／advance 聯集選詞；本試點的十五詞與支援詞均已比對來源檔。每個目標詞保存 `entryGuid`、`word`、`list`、`teachingPos` 與 `senseZh`，讓圖、故事和單字卡共用同一詞條。

故事採英文朗讀，繁中翻譯以文字展開，不另做中文朗讀。`reads → read`、`sleeps → sleep`、`books → book` 等關聯保存於逐句 `wordLinks`；單字卡播放的是原形單字錄音。預檢會核對字形範圍及 GUID，但不判斷字形與原詞是否為正確文法關係，仍須人工審閱故事、翻譯、詞義及畫面是否一致。

故事定稿後再產音，避免文字改動造成重做。使用者已確認旁白沿用字庫的本機 Qwen3-TTS／Serena，採溫暖、清楚的英語老師語氣；不要在測試時呼叫真實生成服務。

## 2. 準備無文字底圖與互動標籤

已確認的十五詞圖可以作為風格與構圖參考，但圖上的文字無法由網頁開關隱藏。已完成[同構圖的正式無標籤底圖](../../output/imagegen/living-room-base-2026-10-09-v1/README.md)，正式 App 已實作疊加英文標籤、指向位置與點選入口。

套件的 `generationPlan.baseImage` 已保存十區塊編輯提示詞與生成紀錄。底圖已目視核對十五個概念、動作與舒適感線索；英文標籤與箭頭已清除，未見可辨識文字。持書背封仍有淡色裝飾短線，無可辨識英文。

已為每詞記錄標籤位置 `interaction.label` 與指向位置 `interaction.object`，x／y 均使用 0–1 的圖片比例座標，供不同螢幕尺寸定位。動詞指向動作，形容詞指向孩子的放鬆姿勢；read／book、sleep／pillow 共用畫面區域時，以圖上標籤或故事字形點選區分。第一版採可點選標籤及標記，不要求先描出每件物品的完整輪廓。座標已在 `_test` 正式 App 完成桌面／手機 QA；未見標籤互遮，手機放大查詞及關閉返回正常。

使用者已取消圖下十五詞清單，改由圖片或故事點字開啟浮在圖片上方的單字 Modal；手機先放大圖片再點標籤。故事由「放大圖片」旁按鈕開啟，不常駐顯示。正式回想模式隱藏英文標籤、故事及翻譯，揭曉後開放單字卡；目前燒字參考圖預覽不提供回想模式。

## 3. 準備旁白與核對已有字庫音檔

已生成一段完整英文故事音檔（Serena，31.896 秒），與既有單字、英文解釋、英文例句錄音分開，仍待使用者試聽。`assets.storyAudio` 保存路徑、檔案 hash、時長與聲線；`textSha256` 綁定故事，文字修改後預檢會拒絕舊旁白 metadata。

basic 原有音檔優先沿用，仍要核對實際檔案與 metadata。advance 的 curtain、shelf、pillow 已全部生成：3 段單字、15 段英文例句、9 段英文解釋，共 27 段，manifest 在 `data/scenario-wordbank-audio/living-room-v1/manifest.json`；尚未匯入正式字庫 metadata。只處理客廳試點，不重做整個 advance 字庫。

`npm run scenario:audio:generate` 預設只列 dry-run 計畫；經使用者明確授權實際產音後，使用 `SCENARIO_REAL_TTS=1 npm run scenario:audio:generate -- --generate` 呼叫本機 Qwen3-TTS。`npm run scenario:audio:test` 的六項測試使用假回應。一般驗證不產音。

故事、單字與例句接入既有音源仲裁：開卡不自動播放；播放單字或例句時暫停故事並保留位置，使用者可自行繼續聽故事。

## 4. 執行離線預檢

從專案根目錄執行：

```bash
npm run scenario:package:check -- docs/scenarios/packages/living-room-15-v1/scenario.json
npm run scenario:package:test
```

此工具不載入環境檔、不連資料庫、不產生圖片或音檔，也不匯入資料。本機素材齊備時為 `valid: true`、`publishReady: true`；音檔未隨 Git 提交，其他環境須另備本機素材。互動座標的實際呈現已完成桌面／手機 QA；旁白試聽及正式匯入仍待驗收。

本機素材與座標齊備後，使用嚴格檢查：

```bash
npm run scenario:package:check -- docs/scenarios/packages/living-room-15-v1/scenario.json --require-publish-ready
```

缺件或不一致時回傳非零結束碼。`publishReady` 只表示套件欄位與檔案預檢通過，不代表圖片內容、音檔品質、正式字庫音檔或上線流程已驗收。圖片是否無文字仍依人工審閱標記，工具沒有 OCR；音檔是否真的朗讀該故事也須實際聆聽。座標、詞形與翻譯的語意品質不能單靠結構檢查判定。

## 5. 匯入、API 與學習頁

`1791504000000_scenarios.sql` 已定義獨立情境、不可覆寫的 revision 及字庫關聯。匯入只建立 draft：相同 key／revision 與內容可重跑，不同內容須增加 revision；驗證 GUID、十五詞覆蓋、媒體 hash／格式與安全路徑，失敗回滾，僅清理本次新增媒體。COMMIT 結果不明時重新取得同一把鎖並查 revision；已提交或無法確認則保留媒體，避免誤刪。先在 `_test` 驗證，不用文章 seed 或 POST /articles 代替情境匯入。

`GET /scenarios`、`GET /scenarios/:key` 提供目前發布內容；指定 revision 的詳情及媒體路由供 admin 查草稿、reader 查已發布版本。匯入及 `POST /scenarios/:key/revisions/:revision/publish` 限 admin；發布再驗證素材，匯入不自動發布。旁白使用受保護媒體路由，公共 `/audio/` 封鎖 `scenarios/`，不能繞過草稿權限。

`GET /wordbank/entries/:guid` 已提供指定字庫詞條與有效音檔。正式 App 的 `#/scenarios`／`#/scenarios/living-room` 沿用字庫單字卡、故事 Modal 與音源仲裁，提供看圖學習／回想；回想揭曉前移除標籤、故事、翻譯與單字入口。點字或播放不自動收藏，不虛構文章來源。QA 使用 API 5180、Vite 5181 與 `_test`，不改原 5174 獨立預覽。

從根目錄執行 `npm run scenario:import -- --dry-run` 可離線核對完整套件；`--check-database` 須明示 `DATABASE_URL`，唯讀核對實際資料庫與字庫。實際匯入需 `--apply --confirm-database '<URL主機:port/DB名>' --confirm-server '<實際IP:port/DB名>' --image-dir '<圖片volume目錄>' --audio-dir '<音檔volume目錄>'`；可用 `--package` 指定套件；`--apply` 不能與 dry-run／check-database 混用。此指令不讀 `.env`、不跑 migration、不啟動 worker、不自動發布。

正式寫入前，先完成旁白試聽、座標與桌機／手機 QA，再依 [AGENTS.md](../../AGENTS.md) 確認具體範圍：實際目標 DB 與備份、情境 migration、底圖／旁白 volume 落點與 draft 匯入、advance 27 段檔案及字庫 metadata 匯入、程式部署、指定 revision 發布。字庫 metadata 匯入器不複製音檔，須另安排 volume 落點。這些正式操作尚未執行，不因套件預檢或測試通過自動部署／發布，也不自動啟動 worker。

## 後續的產生 UI

本輪不做十設定的後台生成 UI。完整試點跑通後再增加：貼上單字 textarea → 字庫匹配與十五詞確認 → 選擇風格／場景／標籤預設 → 審閱故事和圖 → 產音 → 發布。常用設定使用預設範本，十區塊提示詞收在進階設定。

第一輪先採離線套件加素材匯入，可及早發現內容與資料模型缺口；確認同一套內容能順利呈現與練習後，再擴展四十個情境與批次生成。
