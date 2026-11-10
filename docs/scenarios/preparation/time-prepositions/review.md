# 時間介系詞：兩份圖解教材正式發布紀錄

目前狀態（2026-11-08）：**兩組 revision 1 已正式發布，歸入「語法情境」分類28**。[開啟正式分類](http://127.0.0.1:8090/#/scenarios?category=28)。正式匯入、備份、發布及證據見 [正式成果與操作](production-import-review.md)，機器事實見 [final-status.json](final-status.json)。手機、完整點擊與人工聽審仍待驗，發布不代表完整品質驗收。

所需正式 API／learner 程式在本輪開始前已外部部署；主對話核對 API／shared 三檔 SHA 與本機一致，正式 `index-SeLv5tqt.js` 含 guide／hide／show。此為 runtime 靜態程式證據，不是真實點擊。本輪只匯入既有素材，沒有重建／啟停服務、migration、生成或 cloud TTS 呼叫。

正式字庫由9,203增至 **9,204詞／27,664英文解釋／32,993中英例句，最高source id9253**：新增autumn，13既有介系詞保留原資料並追加26子項，含autumn共16 explain／16例句。詞音33檔複製、90檔重用，metadata只補33筆、原90筆不UPDATE。2圖／2旁白與123詞音合計127個正式媒體檔有效。canonical仍為9,244詞／27,784解釋／33,161例句，尚差40個phonics新詞、120解釋及168例句未匯入；各批來源以實際delta為準。

主對話真admin API建立tag28（kind「情境」）、保留既有標籤union後發布兩場，指標均為1。postcheck通過，原13場／25revisions、發布指標、標籤、其他字庫與原音metadata均不變。driver報告的publicationPerformed:false／taxonomyWritesPerformed:false只描述driver自己未做，不能解讀為未正式發布。

## 歷史隔離預覽（已失效）

原 `_test` 預覽曾匯入兩draft，再以 `--browse` 設為測試published／「語法情境」tag3。其 [draft API紀錄](api-verification.json) 與 [分類紀錄](category-verification.json) 保留為歷史證據；全庫測試清除測試資料後狀態為 **invalidated-by-test-suite**。API5180進程仍在不表示教材／分類可用，本輪沒有重建預覽。測試tag3與5181連結不再作交付入口；現在使用正式分類28。

## 教材與音訊成果

| 套件 | 目標／導覽 | 旁白 | 詞音 |
| --- | --- | --- | --- |
| [基礎 r1](../../packages/time-prepositions-basics-r1/scenario.json) | 3 個 prep；19 句／149 tokens | 89.976 秒 | 27 段：21 舊重用＋6 補產 |
| [擴充 r1](../../packages/time-prepositions-extended-r1/scenario.json) | 11 個 prep；19 句／151 tokens | 80.136 秒 | 105 段：產音當下重用 78＋補產 27 |

跨場共用 in 的 9 段，合計 **123 個不同詞音＝90 舊重用＋33 補產**，不是 27＋105 直接相加。擴充的 78 段重用包含第一組先補好的 in 兩段，因此不能用 21＋78 算原有舊音。最後的 report.json 只記第二場 27 段補產，整批 33 段需連同兩份分場 plan 核對。

詞音 [manifest](../../../../data/scenario-wordbank-audio/time-prepositions/manifest.json)、[基礎缺音成果](../../../../data/scenario-wordbank-audio/time-prepositions/plan-time-prepositions-basics.json)、[擴充缺音成果](../../../../data/scenario-wordbank-audio/time-prepositions/plan-time-prepositions-extended.json) 已保存；本次紀錄更新只讀取並引用其 hash，沒有改寫成果檔。完整生成／缺音狀態集中於 [generation-plan.json](generation-plan.json)，包含兩份旁白原 metadata、文字 hash、分場詞音數與成果檔 hash。依主對話追加指示，兩套 generationPlan.wordbankAudio 已為 offline-complete-awaiting-listening-review，附 manifest／audio-verification hash 及實際分場與整批 counts；generationPlan.storyAudio.generated:true，移除待產音的舊 note，status 維持 generated-awaiting-listening-review。上述為歷史備料metadata同步；本輪正式匯入保留scenario.json、strict content、assets.storyAudio與實體來源音檔，generation-plan.json另記正式結果。

[audio-verification.json](audio-verification.json) 含 **125 clips＝123 詞音＋2 旁白**，全部完整解碼、近靜音初篩通過。這是技術檢查，未代替人工發音聽審。日期、2024、介系詞、句子重音與整段語速仍待實聽。

兩份皆為 illustrated-guide／user-specified，真實 teachingPos:prep；within 保留 expert，其餘目標 basic，不要求 n／adj／v 配額。baseImage／referenceImage 同源同 hash，containsVocabularyText:true；含答案的圖解不提供回想。每詞一入口，基礎位於 IN／ON／AT 三個標題，擴充分區配置。

## 內容與來源

- [逐句中英本文](stories.md) 為兩份兒童友善讀圖導覽，共 38 句／300 字母 tokens；圖文涵蓋年、月、季節、一般時段、特定日期／某天早上、時間點與四種不用介系詞的表達。
- 保留 in autumn；支援詞 autumn 為 id 9253、穩定 UUIDv5、三欄 null、完整中文 definition、3 explain／3 中英例句。導覽轉場為 Now, on.／Next, at.，沒有以 fall 取代使用者詞。
- 擴充含 before／after lunch、from nine in the morning to five in the afternoon、Finish by five／Work until five、for two hours／since Monday／during the meeting、in／within two hours。since 使用 I have been here since Monday.；in 指兩小時後，within 指最晚兩小時內、可提早。
- 圖上 a.m.／p.m.、I'll 在旁白改完整時段與 I will；December 25／2024 保留數字。既有 tokenizer 只計字母 token，UTF-16 span 與 GUID 完整，沒有偽造數字 GUID。數字讀法待聽審。
- [wordbank-additions.json](wordbank-additions.json) 為 **14 筆增量：13 個既有介系詞 partial updates＋1 個 autumn**。原 13 詞各追加一 explain／一例句，autumn 各三則，合計 16 explain／16 中英例句。保留既有 GUID、非空文字與分級，不改其他 phonics 增量。canonical 為 9,244 詞；本批14筆delta已正式套用，正式9,204詞，其他40個新詞及相關增量未匯入。
- [來源最小差異](source-merge-verification.json) 是製作前快照的比對紀錄；[Faraday 首輪 read-back 與修復複驗](independent-review-first.md) 獨立核對 13 詞及 autumn、300 tokens 與圖文概念。全來源其他增量的獨立逐欄重驗仍受快照可取得性限制，不擴大該報告的驗證範圍。

## 技術驗證與實際驗收邊界

主對話正式操作後執行並提供結果（本文件更新未重跑DB測試）：

- npm test：**878 pass**，shared288／api147／worker17／admin115／learner311；log `/tmp/time-prepositions-production-test.log`。
- 全workspace typecheck通過，log `/tmp/time-prepositions-production-typecheck.log`；正式QA **9項mock通過**，log `/tmp/time-prepositions-production-qa-tests.log`。歷史873測試、learner build、27項工具測試與preview嚴格tsc見 [validation-logs](validation-logs/)，不是本輪新build。
- 兩套 strict package check 與 import dry-run 均通過；字庫 delta dry-run 14 entries 通過（13 筆 partial 不帶 definition／level，故 CLI 顯示缺 definition 13、basic 0；canonical 原有欄位保留）。
- 兩份 checker valid:true／publishReady:true 表示素材技術 gate 齊備，**不等於品質可發布**。

歷史隔離preview往受testing resolver保護的english_learning_test匯入兩draft與123詞音，後續測試分類曾可瀏覽；如今已被測試清表失效。Faraday 發現 preview 誤送 contentReview 至 strict schema，已改用共用 contentFromScenarioPackage 排除離線 metadata，修復後複驗通過。

[api-verification.json](api-verification.json) 為歷史_test draft階段的唯讀API查核（不是目前正式狀態）：兩 draft 的 targets／story／learningMode／status 與套件一致，圖片／旁白 hash 一致；未比對完整 content hash，旁白 206 Range 可用，14 次目標卡對應 13 個不同詞條，123 音訊 URL 全部 200 且非空，prep 清單計數正確，一般 public 清單沒有 draft。這不等於瀏覽器操作或人工試聽。

原生 Chrome **僅第一組桌機**實際目視橫圖、3 標籤、圖解無回想，以及故事 modal 的 149 tokens／autumn／翻譯按鈕可見。未逐詞點卡，未宣稱翻譯按鈕實際操作。瀏覽器控制 host 無法使用；native Chrome 兩次回報 user changed，因使用者同步操作而停止，避免干擾。**第二組桌機、手機、完整詞卡／放大操作、人工播放／仲裁／離頁、完整聽審與正式角色驗收均待驗。**

狀態及機器可讀事實見 [final-status.json](final-status.json)、[batch.json](batch.json)、[verification.json](verification.json)。Faraday 首輪、修復複驗與第二次文件 read-back 已完成，未發現新阻擋；指出的兩項小文件措辭已修正，最終報告見 [獨立複核](independent-review-final.md)。本次紀錄更新未重新執行全庫測試或操作瀏覽器，不把主對話結果寫成子任務自行重跑。正式API QA通過兩published、分類28、13卡／123音、新增時間語意、素材hash／Range；完整content hash及原13場保護由正式driver postcheck證明，細節與報告連結見 [正式成果](production-import-review.md)。

## 重跑、檢查與製作指令

從 Repo 根目錄執行。日常只檢查或刷新紀錄：

```bash
node scripts/scenarios/prepare-time-prepositions.mjs --check
node scripts/scenarios/prepare-time-prepositions.mjs --records-only
node scripts/check-scenario-package.mjs docs/scenarios/packages/time-prepositions-basics-r1/scenario.json --require-publish-ready
node scripts/check-scenario-package.mjs docs/scenarios/packages/time-prepositions-extended-r1/scenario.json --require-publish-ready
npm run scenario:import -- --package docs/scenarios/packages/time-prepositions-basics-r1/scenario.json --dry-run
npm run scenario:import -- --package docs/scenarios/packages/time-prepositions-extended-r1/scenario.json --dry-run
npm run vocabulary:import -- docs/scenarios/preparation/time-prepositions/wordbank-additions.json --dry-run
```

--check 唯讀，核對 canonical／增量、定稿 content、圖片與旁白 hash、最新 verification／generation-plan、125 筆音訊證據。--records-only 只刷新批次生成紀錄，不寫 source／scenario.json／音檔。無參數是最初備料入口，保留現有 generationPlan、contentReview、assets 與其他 metadata；核心 content 漂移或旁白 hash 不符時停止，不能改寫既有定稿。既有 import-review／vocabulary-review 不覆寫，batch／verification的人工進度與額外欄位保留；正式授權／結果由final-status.production同步，deploy授權不等於本輪重建。review.md、final-status.json由主對話／驗收者維護。

既有重跑與旁白保留證據見 [idempotence-verification.json](idempotence-verification.json)、[audio-retention-verification.json](audio-retention-verification.json)；產音前 mock 測試屬歷史紀錄，本輪另補 [最終紀錄保留驗證](final-records-verification.json)，不以歷史套件 hash 代替現在成果。

查目前目標缺音計畫（不帶寫入旗標，唯讀；目前應無缺音）：

```bash
node scripts/scenarios/prepare-time-prepositions-audio.mjs --package docs/scenarios/packages/time-prepositions-basics-r1/scenario.json --package docs/scenarios/packages/time-prepositions-extended-r1/scenario.json
```

以下是**已完成製作流程的重現方式**，目前成果已齊，不為驗證再次產音或改寫 manifest。真實生成須 SCENARIO_REAL_TTS=1 與 --generate，僅呼叫 loopback HTTP 本機 Serena；沒有遠端 LLM／圖片生成。逐場先基本、再擴充，才能重用共同 in：

```bash
SCENARIO_REAL_TTS=1 node scripts/generate-scenario-audio.mjs --package docs/scenarios/packages/time-prepositions-basics-r1/scenario.json --output data/scenario-audio/time-prepositions-basics-r1 --endpoint http://127.0.0.1:8000/v1/audio/speech --generate
SCENARIO_REAL_TTS=1 node scripts/generate-scenario-audio.mjs --package docs/scenarios/packages/time-prepositions-extended-r1/scenario.json --output data/scenario-audio/time-prepositions-extended-r1 --endpoint http://127.0.0.1:8000/v1/audio/speech --generate
SCENARIO_REAL_TTS=1 node scripts/scenarios/prepare-time-prepositions-audio.mjs --package docs/scenarios/packages/time-prepositions-basics-r1/scenario.json --package docs/scenarios/packages/time-prepositions-extended-r1/scenario.json --scene time-prepositions-basics --generate --copy-reused --report
SCENARIO_REAL_TTS=1 node scripts/scenarios/prepare-time-prepositions-audio.mjs --package docs/scenarios/packages/time-prepositions-basics-r1/scenario.json --package docs/scenarios/packages/time-prepositions-extended-r1/scenario.json --scene time-prepositions-extended --generate --copy-reused --report
```

## 隔離 preview 歷史重現指令（目前不可用）

以下只保留歷史重現方式，不能據此宣稱當前preview有效；全庫測試已清表，本輪未重建。日常交付使用正式URL。未來另次重建須先確認測試庫／migrations與port，以下是**會寫 _test** 的預覽匯入，不是唯讀檢查。腳本經 shared/src/testing.ts 只解析 TEST_DATABASE_URL（預設 localhost:5433/english_learning_test），拒絕非 _test，不讀正式 DATABASE_URL；不清表、執行 migration 或生成；--browse 僅在受保護測試庫將本批兩組設為 published 以供分類瀏覽。沒有重置／seed 流程；既有 revision 不符會拒絕。

終端一：

```bash
TSX_DISABLE_CACHE=1 node --import tsx scripts/scenarios/preview-time-prepositions.ts --browse --package docs/scenarios/packages/time-prepositions-basics-r1/scenario.json --package docs/scenarios/packages/time-prepositions-extended-r1/scenario.json
```

終端二：

```bash
VITE_API_PROXY=http://127.0.0.1:5180 npm run dev -w @el/web-learner -- --host 127.0.0.1 --port 5181 --strictPort
```

僅未來重新匯入測試教材且服務就緒後，才可使用以下歷史查核（會更新preview報告）：

```bash
node scripts/scenarios/verify-time-prepositions-preview.mjs --browse
```

- 歷史失效連結：[基礎 preview](http://127.0.0.1:5181/#/scenarios/time-prepositions-basics/revisions/1)
- 歷史失效連結：[擴充 preview](http://127.0.0.1:5181/#/scenarios/time-prepositions-extended/revisions/1)

正式入庫與發布已在明確授權下完成；_test歷史證據、正式發布、API技術驗證與人工品質分開記錄。
