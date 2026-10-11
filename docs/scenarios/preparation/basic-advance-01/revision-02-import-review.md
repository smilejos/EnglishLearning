# 九篇情境選詞、故事與分類回想修訂驗收

正式唯讀總核：2026-10-11T01:30:24.849Z。九篇最新版皆為 draft，共 213 個目標詞次（每篇名詞 15、形容詞 5、動詞 2–5）。所有舊版 hash、狀態及發布指標保持；客廳仍發布 revision 1，其餘仍未發布。新版程式尚未正式部署。

## 各篇最新版與預覽

本機 5174 為新版前台預覽，連接既有正式 API；需沿用既有登入。正式服務未重啟。

| 編號 | 情境／本機預覽 | 最新 draft | 名詞／形容詞／動詞 | 合計 | 本次移出目標詞 |
| --- | --- | --- | --- | --- | --- |
| 01 | [客廳裡的午後](http://127.0.0.1:5174/#/scenarios/living-room/revisions/2) | 2 | 15／5／4 | 24 | 無 |
| 02 | [一起準備早餐](http://127.0.0.1:5174/#/scenarios/breakfast-kitchen/revisions/2) | 2 | 15／5／2 | 22 | 無 |
| 03 | [全家共享晚餐](http://127.0.0.1:5174/#/scenarios/family-dinner/revisions/2) | 2 | 15／5／4 | 24 | 無 |
| 04 | [整理臥室](http://127.0.0.1:5174/#/scenarios/tidy-bedroom/revisions/2) | 2 | 15／5／3 | 23 | blue、white |
| 05 | [一起洗衣曬衣](http://127.0.0.1:5174/#/scenarios/laundry-day/revisions/2) | 2 | 15／5／4 | 24 | 無 |
| 06 | [分組設計房屋](http://127.0.0.1:5174/#/scenarios/classroom-group-work/revisions/2) | 2 | 15／5／4 | 24 | 無 |
| 07 | [到圖書館找故事](http://127.0.0.1:5174/#/scenarios/library-visit/revisions/3) | 3 | 15／5／5 | 25 | 無 |
| 08 | [美術課創作花園](http://127.0.0.1:5174/#/scenarios/art-class/revisions/2) | 2 | 15／5／4 | 24 | 無 |
| 09 | [觀察水與顏色](http://127.0.0.1:5174/#/scenarios/water-science/revisions/3) | 3 | 15／5／3 | 23 | clear |

各篇完整新增／保留詞、GUID、情境詞義與故事可見對應套件，原始定稿文字見 [revision-02-texts.json](revision-02-texts.json)。以圖面相關性選詞；移出表示不再列為本場目標，不代表字庫刪除。臥室移除 blue／white；科學實驗的 blue／yellow 保留，因故事與畫面正在進行混色實驗。

## 素材與匯入

九張無文字底圖全部復用；生成 9 個新版全文英文旁白，僅補正式字庫缺少的 84 段目標詞錄音，全由既有本機 Qwen3-TTS／Serena 產生。沒有圖片或 LLM API 呼叫，也沒有為驗證重新產音。中英故事皆分兩小段，仍使用單一全文旁白。

圖書館 revision 3 僅修正 tall 箭頭指向高書架；科學實驗 revision 3 僅移動 height／empty 標籤以排除文字重疊。兩篇 revision 2 仍保留；修正版沒有重新生成圖片或錄音。

匯入前核對實際 DB、既有 migration、字庫、audio／images volume 與備份；完整 gzip／tar 列表及 DB dump 解析通過，使用前逐檔重算備份 SHA-256。未執行資料庫還原演練。每篇嚴格套件檢查、dry-run、DB check 及 postcheck 通過，素材 hash、字庫關聯與目標錄音缺件為零；音檔均完整解碼。

## 實際介面驗收

九篇桌面逐一開啟全部目標詞卡（213 詞次）；每篇手機放大後抽查名詞／形容詞／動詞各一張卡。九篇皆驗證三類獨立揭曉、累加、收起與未全揭曉的故事 gate，雙段英文／繁中翻譯及旁白控制。圖書館、科學實驗修正版另核對全部標籤數、分類揭曉、受影響單字卡及實際畫面。

看圖學習呈現全部目標；看圖回想收起任一類時關閉故事並暫停旁白。手機須放大圖片點圖上標籤。未宣稱使用者完整聽覺驗收或正式 learner 角色端到端驗收。

截圖與操作紀錄保存在 `.impeccable/review/scenario-revision-02/`，正式機械核驗／匯入／UI 摘要在 `data/scenario-preparation/basic-advance-01/`。

## 程式與授權邊界

完整 `LC_ALL=zh_TW.UTF-8 npm test`、`npm run typecheck`、`npm run build` 及 20 項匯入／套件安全測試通過；測試庫已清理，`git diff --check` 通過。保留既有修改，尚未提交、push、部署或發布新版；未啟動生成服務。10 的圖片 gate 保持等待，11–40 尚未開始。
