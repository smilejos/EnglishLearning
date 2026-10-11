# 使用者指定詞與缺詞入庫

使用者提供單字時必讀。指定詞優先，不限制 basic／advance；預設分級選詞是另一種模式，第一批歷史限制不適用所有未來教材。

## 選詞與契約的區別

- 保留使用者原始清單與指定詞義，按詞性／活動合理分場，不因 expert 或未分級淘汰。若未指定意思，依場景和字庫核對；真正有歧義才問需要的詞義。
- 15 n／5 adj／最多 5 v 是未另指定時的方向，不要求使用者清單達到配額。超過單場 25 詞優先拆場；片語、非 n／adj／v、抽象詞先評估圖片和現行契約，不偷偷改詞性或拆詞冒充原意。
- 故事支援詞優先簡單、常用，但指定詞模式不套 basic／advance 硬限制；每個 token 仍對應有效字庫原形，未存在的支援詞也列缺詞計畫。
- 2026-10-11 查核：`WordbankEntrySchema` 可保存 expert／null；但 `shared/src/scenarios.ts`、`shared/src/scenarioStudio/contracts.ts`、`shared/src/scenarioStudio/story.ts`、`api/src/routes/scenarioStudio.ts` 與 `scripts/check-scenario-package.mjs` 仍有 basic／advance 限制。**改技能不代表這些程式已支援指定詞匯入。**
- 執行時先查當下程式與運行中版本。若仍不支援，先完成可審閱備料與缺詞增量，列明需適配的契約、查詞／故事驗證、匯入預檢及其受影響測試；不偽標 basic／advance、不直接繞過 validation。完成必要程式適配並驗證後才走自訂詞情境匯入，正式部署仍按授權。

## 查重與正式詞條

1. 查 `source/vocabulary-database.json` 與唯讀實際 DB，不只查 basic／advance 的後台搜尋結果。trim／小寫用於匹配候選，保留正式拼字與原形。
2. 已有適用詞條重用 GUID；同字多 GUID 依詞性／詞義明確選用。資料庫不自動按 word 去重，不能每次提供同字就產新 GUID。
3. 現有詞條缺少指定意思時，整理補缺方案，區分情境 senseZh 與字庫內容；不能只填情境詞義、留字庫釋義／解釋相互矛盾。既有 importer 保留非空定義，追加例句／解釋可用，但不是任意覆寫工具；必要修正文案另列可審閱異動。
4. 真正不存在才新增。一次分配穩定 UUID、來源 id、英文解釋與例句各自子 GUID，重跑沿用。核對來源與 DB 未占用的正整數 id，記錄配置；id／word 沒有唯一約束，不靠 schema 自動防重。

## 新增資料與可追蹤來源

現行 `shared/src/wordbank.ts` 的機械最低值是正整數 id、UUID guid、非空 word，其餘可空；**教材詞條仍應具備**本次詞性、自然繁中釋義、清楚英文解釋、英文例句及對應繁中翻譯，供詞卡與 local TTS 使用。沒有完成的內容要標缺件，不以最低 schema 值宣稱教材完成。

`level` 的 CEFR／台灣 7000／list 沒有可靠依據就留 null，不能編造分級。category／scenario 可沿用既有詞庫格式保存有依據的分類；不把這些詞條欄位當作 App 已有批次分類功能。

在 `docs/scenarios/preparation/<batch-key>/` 保存只含本次新增／補缺的 `{ "entries": [...] }` 匯入增量，以及逐詞重用／多義選擇／待新增清單；計畫 GUID 標待入庫，不能混充 live 存在。同步維護 `source/vocabulary-database.json` 的可追蹤詞條，不覆寫無關既有資料。只改 DB 不同步來源，現行字庫音檔 importer 的來源檢查會找不到新 GUID。

## 匯入與補音

先做離線字庫增量驗證：

```bash
npm run vocabulary:import -- docs/scenarios/preparation/BATCH/wordbank-additions.json --dry-run
```

`scripts/import-vocabulary.ts` 的 dry-run 不連 DB；**沒有 `--apply` 保護，移除 `--dry-run` 就是正式寫入**，需要明示已核對的 `DATABASE_URL`。先讀實際 CLI、查 DB／備份、展示具體新增與補缺清單，按已有同一操作授權執行，不重問；若只有教材 draft 匯入授權且未涵蓋詞條寫入，先完成增量與檢查，再確認新增部分。

既有 `shared/src/repo/wordbank.ts` 全交易、依 GUID 補缺，不刪詞、不動既有音檔。它保留原 word／id／非空文字與非 null 分級，合併詞性／分類，子 GUID 對應追加或補缺；不能期待它自動按同字合併或修正錯誤非空內容。現行 `/wordbank` API 為讀取入口，沒有可假定存在的新增 HTTP 路由。

匯入後依 GUID read-back 新詞與所有相關子項，核對来源與 DB 一致、既有詞／音訊 metadata 未受影響。這些新增正式詞條確認存在後才完成情境 wordLinks／target GUID 及當下契約檢查。

local TTS 依本次目標詞及有效文字 hash 只補缺音，保留來源、profile、manifest 與解碼／試聽紀錄。不把缺詞寫入當作真實 LLM／TTS／圖片授權，也不擴大補音為整個字庫。新詞音檔與 metadata 都完成並確認指定詞情境契約相容，才進入正常 draft 匯入與驗收。

## 驗收要多確認

- 使用者原清單沒有因分級被過濾；任何拆場、屈折形／原形與詞義決定可追蹤。
- 新詞／重用詞無意外同字重複 GUID，source id 與子 GUID 穩定；來源 JSON、DB read-back、情境／故事連結一致。
- 未分級仍是 null，不虛標；指定詞模式的兼容測試涵蓋 expert、新未分級詞、既有詞重用、重跑與預設 basic／advance 行為。
- 缺詞內容、音檔及契約問題如實列出，不把備料、詞條已入庫、情境已匯入、已發布或已部署混成一個完成狀態。
