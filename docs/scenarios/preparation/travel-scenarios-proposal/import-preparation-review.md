# 旅遊四場：匯入準備總表

> 2026-11-12 08:45 正式更新：使用者已授權本批正式匯入與發布；四場 revision 1 均已 **published／發布指標1**，可由[正式情境清單](http://127.0.0.1:8090/#/scenarios)開啟。正式字庫已新增3詞並合併4筆例句，278新詞音＋7筆既有錄音 metadata、4圖與4旁白均已匯入；728媒體正式HTTP／SHA驗證通過，舊資料及舊檔案保持不變。完整結果與限制見[正式發布紀錄](production-import-review.md)。

## 以下為正式匯入前的準備快照

更新：2026-11-12T02:19:49+08:00

離線圖片、文字、映射、座標與音訊檔已備妥，仍待人工聽審與前台品質驗收。

正式DB／正式audio與images volumes未寫入，也沒有正式draft匯入、發布、migration或部署。本輪只在獨立_test DB與測試媒體volume建立四個draft及728份媒體副本；產音使用使用者指定的LAN Qwen服務，不啟動生成worker。

| 情境 | key／預定revision | 詞數 | 圖片素材 | 英文旁白 | 檔案 |
| --- | --- | --- | --- | --- | --- |
| 機場登機 | travel-airport-gate / 1 | 26 | v2 | 已綁定，待聽審 | [套件](../../packages/travel-airport-gate-r1/scenario.json)／[審閱](../../packages/travel-airport-gate-r1/import-review.md) |
| 飯店櫃檯入住與周邊服務 | travel-hotel-check-in / 1 | 29 | v1 | 已綁定，待聽審 | [套件](../../packages/travel-hotel-check-in-r1/scenario.json)／[審閱](../../packages/travel-hotel-check-in-r1/import-review.md) |
| 搭乘渡輪 | travel-ferry-trip / 1 | 19 | v1 | 已綁定，待聽審 | [套件](../../packages/travel-ferry-trip-r1/scenario.json)／[審閱](../../packages/travel-ferry-trip-r1/import-review.md) |
| 飛機上的餐飲與艙等體驗 | travel-airplane-cabin / 1 | 29 | v1 | 已綁定，待聽審 | [套件](../../packages/travel-airplane-cabin-r1/scenario.json)／[審閱](../../packages/travel-airplane-cabin-r1/import-review.md) |

## 隔離_test預覽（唯讀）

四套均為_test內的draft revision1，請直接開指定版本網址；一般清單仍只顯示published，不為方便預覽而發布。

- [機場登機](http://127.0.0.1:5181/#/scenarios/travel-airport-gate/revisions/1)
- [飯店櫃檯入住與周邊服務](http://127.0.0.1:5181/#/scenarios/travel-hotel-check-in/revisions/1)
- [搭乘渡輪](http://127.0.0.1:5181/#/scenarios/travel-ferry-trip/revisions/1)
- [飛機上的餐飲與艙等體驗](http://127.0.0.1:5181/#/scenarios/travel-airplane-cabin/revisions/1)

- 前台127.0.0.1:5181，API127.0.0.1:5180；測試DB english_learning_test；測試audio/images volumes以marker核對，API媒體mount為唯讀。
- 正式audio volume只作bootstrap的唯讀來源，沒有寫入。新_Test共用audio volume保持相同wordbank/profile/GUID與業務API路徑，未建立前端本地播放來源。
- [HTTP整合證據](evidence/test-preview-http-check.json)：92個不同單字、720詞音URL與4圖／4旁白，共728媒體完整SHA/bytes核對；12項Range抽查通過，唯讀proxy拒絕POST。
- [測試環境識別](test-preview-runtime.json)；[媒體正式複製計畫（尚未執行）](media-copy-plan.json)。
- 若後續跑npm test，測試庫可能清表而使預覽失效；可依[測試啟動器](test-preview-docker.py)以bootstrap模式重建這四個draft。不得把_test資料當作正式已匯入。 若原備料 image 已移除，可明示 `TRAVEL_TEST_IMAGE` 為已核對的本機 Docker image SHA-256 ID，再執行 `python3 docs/scenarios/preparation/travel-scenarios-proposal/test-preview-docker.py bootstrap`；此覆寫只影響隔離測試工具。

## 資料與字庫

- 四場共103目標詞次，去重92詞；33句故事、355英文tokens／346個wordLinks，全部目標覆蓋。
- [準備文本](prepared-texts.json)；[互動座標](interactions.json)；[離線位置預覽](coordinate-review.html)。預覽只供位置審閱，不播放本地音訊，也不是已匯入的正式學習頁。
- canonical由9244增加至9247；原9244筆深比較完全未變。只新增baggage cart／business class／economy class三詞，每詞3英文解釋＋3中英例句，無依據的分級維持null。
- [正式字庫增量](wordbank-additions.json)共7筆：3新詞＋boat／pen／sit／board四個既有詞各追加1例句。partial delta省略定義／解釋是有意的最小增量；merge驗證原欄位、解釋與舊例句保留。
- 三新詞source id9254–9256與GUID／word已於正式READ ONLY查核時確認未占用；仍未寫入正式DB，正式寫入前須重查。
- 正式字庫9204詞與canonical差43詞，其中40個先前phonics詞不屬本批，不能整本匯入canonical來代替這7筆增量。
- 證據：[canonical差異](evidence/canonical-update.json)／[ID占用](evidence/new-word-id-preflight.json)／[例句merge](evidence/existing-example-merge-verification.json)。

## 音訊需求與實際進度

- 本批新增音訊落檔：字庫278/278、旁白4/4。計畫合計282段，未完成部分不能用placeholder或舊文字音檔補位。
- 既有435項wordbank錄音可直接重用；另7項registry錄音有效但需補wordbank_audio metadata。442檔已直接由正式volume核對並完整解碼。
- 計畫新產278項字庫音訊＝既有詞缺音257＋三新詞素材21；另4篇全文英文旁白，不產中文旁白。
- 新音訊採使用者提供的LAN服務 http://192.168.1.124:8000 ，實際宣告模型Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice、Serena，新profileHash `2706fd2bc0c87488`。有效舊音不重產，也不改寫既有profile。
- Gradio下載已支援此服務的Windows絕對路徑；首次試音曾因路徑guard拒絕、其後一次連線逾時而未落檔，紀錄保留。恢復後的成功試音已解碼／近靜音檢查；音檔完整性不等於發音人工聽審。
- 新MP3保存在Repo離線data，並已複製到隔離_test共用audio volume供業務API預覽；正式audio volume尚未寫入。前台沒有引用public／本地MP3或新增播放回退。
- [音訊盤點](evidence/audio-inventory.md)／[完整JSON](evidence/audio-inventory.json)／[7項重用metadata計畫](evidence/registry-metadata-reuse-manifest.json)／[LAN產音計畫](lan-generation-plan.json)。
- 音訊metadata正式補齊前須先merge四個既有詞缺例句；本批新增metadata計畫共285（278新音＋7既有錄音登錄），原435項不更新。

## 已做驗證與限制

- 四份離線package check及strict content schema皆有效；目前publishReady與dry-run狀態見[檢查JSON](offline-checks.json)及[dry-run紀錄](import-dry-runs.json)，不以工具完整性代替品質驗收。
- 103個interaction.object均經獨立讀圖，3項錯指已修正；近似label字框無重疊。_test已完成資料與媒體HTTP驗證，但CUA browser access host unavailable，未做實際瀏覽器／手機視覺或點擊操作驗收。
- 運行中的正式API以容器實際ScenarioContentSchema測四份內容皆通過，四個情境相關檔SHA與Repo一致；支援1–29詞／user-specified／故事分段，未呼叫HTTP路由或ensureUser寫入。[唯讀證據](evidence/runtime-contract-preflight.md)。
- npm test：933項通過；typecheck：全workspace通過；音訊工具34項與_test入口6項測試通過。完整測試結束後已先清理_test堆疊，再重建專供本次預覽；預覽期間不可再跑會清表的整合測試。[驗證摘要](evidence/validation-summary.json)。
- 未做完整人工聽審、正式前台角色／UI、手機密度、播放仲裁或發布驗收。
- 找到既有備份位置，但只核對存在／bytes／mtime，未重新驗hash／解析／還原；不能視為本次正式匯入備份gate已通過。

## 正式寫入前的具體清單

1. 離線音訊與hash已完成；繼續人工聽審及桌機／手機實際UI、播放仲裁與角色驗收，不以HTTP成功代替視覺／操作驗收。
2. 重查實際DB english_learning及server、四key下一版、migrations、掛載與當下有效備份，不重用舊IP/日期直接繞過baseline。
3. 明確列出並取得正式寫入授權：本批7筆字庫增量、278新增音檔與7metadata重用、4圖／4旁白及四個不可覆寫draft revision1。使用者目前只要求準備匯入，尚未授權這些正式寫入。
4. 按場檢查／複製到共用audio與images volume／metadata／匯入／postcheck；同路徑不同hash或symlink即停止。
5. 匯入不自動發布，也不包含部署或啟動生成worker。

## 狀態分開記錄

- 教材離線資料：圖片、故事、GUID映射、座標與282新音檔皆已備妥；人工聽審與UI仍待完成。
- 正式draft匯入：未執行。
- 品質可發布：未驗收。
- 已發布：否。
- 程式已部署：本輪無部署。
