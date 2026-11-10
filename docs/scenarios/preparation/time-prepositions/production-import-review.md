# 時間介系詞正式成果（2026-11-08）

兩場revision 1已published／pointer1，真admin API建立「語法情境」tag28（kind情境）、PUT標籤union後POST發布。[正式分類入口](http://127.0.0.1:8090/#/scenarios?category=28)。所需程式於本輪前外部部署；本輪只匯入既有素材，未重建／啟停服務、migration、生成或呼叫cloud TTS。

- [baseline](../../../../data/scenario-preparation/time-prepositions-production/baseline-20261108.json)：正式english_learning／172.18.0.4:5432，原13場／25revision、9203詞。
- [fresh backup驗證](../../../../data/scenario-preparation/time-prepositions-production/backup-verified-20261108.json)：私密備份位於`data/backups/time-prepositions-production/20261108-011011`；DB dump全解析、gzip／tar完整、hash／bytes與baseline綁定均通過，restoreTest:false。只引用原紀錄，不複製baseline內容。
- [apply](../../../../data/scenario-preparation/time-prepositions-production/apply-20261108.json)：autumn新增1詞、13舊詞partial merge，合計16解釋／16例句；詞音33複製／90重用，metadata只補33筆／保留原90列。
- [postcheck](../../../../data/scenario-preparation/time-prepositions-production/postcheck-20261108.json)：原13場、25revision、指標、標籤、其他字庫及原音metadata不變，127媒體檔有效。publicationPerformed:false／taxonomyWritesPerformed:false只表示driver自己未做；主對話已經API分類與發布。
- [正式API QA](production-verification/2026-11-07T17-35-49-702Z-after-apply-776fd1c0-355a-4759-8408-5b7c00ce70e2.json)：兩published、分類28、13卡／123音、新增時間語意、圖／旁白hash與Range通過；公開JS的guide／hide／show為靜態證據，非真點擊。原13場保護由postcheck補足。

主對話正式SQL聚合：9204詞／27664解釋／32993例句／最高source id9253。canonical仍9244／27784／33161；差40個phonics新詞、120解釋、168例句未入庫，各批來源以實際delta為準。主對話npm test878、全workspace typecheck及正式QA9項mock通過，log為`/tmp/time-prepositions-production-{test,typecheck,qa-tests}.log`；本文件更新未重跑測試。手機／完整點擊／完整聽審仍pending；發布授權不代替驗收。

`_test`預覽已被全庫測試清表失效，狀態invalidated-by-test-suite；5180進程仍在不等於教材可用，本輪未重建。日常離線紀錄檢查如下（本次文件更新僅執行這兩個命令）：

```bash
node scripts/scenarios/prepare-time-prepositions.mjs --records-only
node scripts/scenarios/prepare-time-prepositions.mjs --check
```

後續如需正式唯讀重查，可使用`node scripts/scenarios/verify-time-prepositions-production.mjs`或driver的`postcheck --baseline data/scenario-preparation/time-prepositions-production/baseline-20261108.json`；本輪文件收尾不重跑。完整機器狀態與授權／執行區別見[final-status.json](final-status.json)，人工進度保留，fresh-context文件read-back已由Pasteur完成，未發現阻擋；該審閱僅核對文件與離線資料，不代替正式操作或人工聽審。
