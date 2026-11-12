# 旅遊四場：最終匯入備料獨立 read-back

核對日期：2026-11-12（Asia/Taipei）。範圍為最終交付文件與既有證據的靜態一致性回看，沒有重新連線正式／測試DB、HTTP、Docker或LAN TTS，也未重跑整體審查或測試。

## 結論

通過本次精簡read-back，沒有未解的資料或文件一致性錯誤。完成的是離線備料與隔離_test資料／媒體HTTP驗證；正式寫入、人工聽審及瀏覽器／手機操作驗收仍未完成，文件沒有把publishReady或HTTP成功宣稱為品質發布驗收。

## 核對結果

- [匯入準備總表](../import-preparation-review.md)與四份package import-review一致：278新字庫音檔及4旁白完成，旁白均綁定、仍待聽審；字庫manifest實際278 entries，四個story manifest各1 entry。
- [測試環境識別](../test-preview-runtime.json)記錄4個draft、163詞條、720詞音、728測試媒體。163為包含故事用詞的測試字庫，不與92個不同目標詞卡混淆。
- [HTTP證據](test-preview-http-check.json)實際列4個draft（26／29／19／29目標）、92張不同詞卡；詞卡audioCount合計720。media實際728筆且URL不重複，組成720 wordbank＋4 image＋4 story，與摘要一致。
- [驗證摘要](validation-summary.json)的720詞音／728媒體／12 Range抽查／POST拒絕與HTTP證據一致；browserUI.completed、runtime.browserUIVerified與HTTP.browserUICompleted皆false。正式寫入／productionChanged皆false。
- 5份交付審閱Markdown中所有相對檔案連結存在，包括旁白離線備料；總表四個預覽URL與runtime.urls及HTTP證據四key完全一致，均為127.0.0.1:5181的指定draft revision1路徑。
- 四份import-review原有「僅離線／沒有draft匯入」措辭可能混淆_test載入；root已修正為「本輪完成離線備料、LAN產音與隔離_test預覽；未寫入正式DB／正式audio與images volumes，沒有正式draft匯入、發布或部署」。本次已逐份重新確認該修正，問題結案。
- 架構導覽頁首亦明列282新音完成及728測試HTTP驗證，仍保留人工聽審與前台／手機限制。

## 四個預覽網址

- [機場登機](http://127.0.0.1:5181/#/scenarios/travel-airport-gate/revisions/1)
- [飯店入住](http://127.0.0.1:5181/#/scenarios/travel-hotel-check-in/revisions/1)
- [搭乘渡輪](http://127.0.0.1:5181/#/scenarios/travel-ferry-trip/revisions/1)
- [飛機機艙](http://127.0.0.1:5181/#/scenarios/travel-airplane-cabin/revisions/1)

網址僅靜態核對，沒有在本read-back重新請求或實際開啟瀏覽器；服務當下可用性及音訊／視覺品質不屬本次獨立驗證結論。後續npm test可能清表使預覽失效，總表已說明。

## 批次狀態補充回看

batch.json四場當前selectionStatus均為selection-and-guid-mapping-complete-offline-and-test-verified，revisionStatus明確區分_test draft r1與正式仍planned；初始selectionStatus另保存為planningSelectionStatus。頂層notes已標示逐詞status/sourceLine為初始規劃快照，當前以scene.status與importPreparation為準。第4場wordbankStatus明列29 canonical、0 canonical缺詞及2待正式補入；仍未宣稱正式完成。無需改寫原始逐詞快照。
