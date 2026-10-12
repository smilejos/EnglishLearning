# 麥當勞四場素材 fresh-context read-back

2026-10-12，獨立於主線備料／生成代理。此份檢查不呼叫真 API、不連 DB、不啟動正式服務。

## 結論與證據

- 37 新詞、111 解釋與111中英例句；主項id9176–9212、259主子GUID皆UUIDv5，彼此與canonical來源無撞號；37拼字無canonical完整詞重複。新詞分級全部null。來源SHA256仍為 `7df89d8abab18348a0acbfe5720c108a7a2b54057e6aee22f9d488dc37b446ea`。review逐詞表所有欄位完全匹配JSON。
- 新詞category：Others31、Food & drinks4、Tableware1、Houses & apartments1；名詞35、形容詞2，À la carte另記副詞（情境採形容詞）。自然教材釋義、例句與英文拼字未見阻擋；商標餐點以一般物件描述，回收以現場圖示為準。
- `wordbank-category-updates.json:5` French fries與`:56` trash can保留既有GUID/id/POS/level/定義/3解釋/3例句，除category外與canonical來源逐欄完全相同，category只有Others，既有 importer會合併（`shared/src/wordbank.ts:61`）。兩筆官方dry-run exit0，明示不連DB。
- `wordbank-definition-repair.json:2` tray重用既有GUID，beforeZh精確等於來源定義，`:5` proposedZh為具體修正，`:6` proposal-not-applied。未混入新增增量、未修改來源或DB。補缺 importer保留非空定義（`shared/src/wordbank.ts:59`），因此不能宣稱套增量會自動修正tray。
- 四package共104個不同拼字與104個不同target GUID，62n/22adj/20v；第一場17n/7adj/5v，其餘各15n/5adj/5v。67來源重用、37planned新增。真實expert/null分級保留、POS均與來源匹配。
- 四package與generation-texts／review故事逐句、id、全文英／中完全一致；15/12/11/15句共53句。507個GUID span全解析且不重疊、start/end UTF-16可截回surface；38多token詞組（含連字號），全部104目標有target span。各故事hash與audit/音檔textHash一致。
- 12個package media（reference/base/storyAudio）的實體路徑與SHA256完全匹配；四旁白bytes/textHash一致，時長78.696/63.648/49.968/75.744秒。此代理未人工完整聽音。
- 四個preview HTML內嵌targets與當前scenario.json完全相同、JS語法有效；四個geometry JSON每個label/object與actualpackage一致，四尺寸都0相交/0越界。靜態畫布為1170/974/718/1672px，原圖1672×941。未放大手機CSS隱藏labels。
- 總預覽 `generated-review.html` 104詞表、53雙語句、四圖四音path精確匹配actualpackage。四份import-review圖音path/hash/duration精確匹配。批次/兩review/總預覽/四import-review共81可解析本機路徑連結全部存在。
- 官方Scene2/3/4 package check配合本機merged source、require-publish-ready皆exit0/valid/publishReady true；不代表canonical正式匯入、正式UI或人工音質已驗收。
- `git diff --check`通過。本代理未重跑全庫test/typecheck，主線所報全測結果另有證據；本輪只修改離線產物與label。

## 圖像與座標

Scene1由主線改6個labels，本代理同步preview；Cash Register與busy於718px畫布水平間隙14.44px，friendly移(.715,.548)避收銀員臉與counter，entrance移(.055,.12)避母親眼睛。
Scene2本代理只改13labels，修正底部越界與臉部遮擋；v2熱薯條蒸氣清楚、不同漢堡內餡與冷飲冰塊可辨。
Scene3 v1生菜薄線曾阻擋；v2寬皺褶綠葉通過lettuce/fresh圖像線索。本代理只改4labels。
Scene4 v1髒紙投回收桶曾回報；v2改乾淨攤平棕紙袋，匹配綠桶棕紙袋pictogram。空杯在前景托盤、adult還盤架、far-end clean三句對實圖成立。本代理只改12labels；read最新套件並完整保留audio/object/GUID/story。

各場詳細紀錄見 `docs/scenarios/packages/mcdonalds-*-r1/interaction-preview-review.md`。四場標籤圖上全部主角臉與食物／工具重點可見；全部箭頭同時顯示仍穿越部分物件，適合按詞性逐類審閱。

## 限制與最後狀態

沒有瀏覽器DOM／觸控／正式詞卡／播放仲裁／角色驗收。file:// browser動作被URL安全策略拒絕，原文明確禁止workaround／alternate surface，未再換路。sharp/Pango字型幾何只是近似，weight與advance width差異待正式UI核對。完整旁白、詞音、解釋與例句人工試聽未做；音檔可完整解碼不等於發音驗收。

正式DB只有主線唯讀target盤點，故事支援詞正式契約未完整核對；planned GUID未正式寫入、canonical未同步，draft匯入／發布／部署均未完成及未授權。tray修正與兩category更新保持具體提案。末場詞音已完成；本代理最終核對423新增／335重用／4旁白／427新MP3總表與各manifest/verification一致，另對423詞音實體SHA256、bytes與文字hash獨立重新核對，全數通過。未重做完整解碼或人工試聽。

最後文句矛盾皆已修正。依主線授權，本代理僅修 `review.md:199` 活動描述空杯改前景托盤、`wordbank-additions-review.md:3` 重複「寫入授權」、末段「本場」改四場與少量簡體字；沒有改pkg/assets。generation scope已明示完整mapping另見package，category兩提案已備妥未套用，雞魚堡v2辨識度已更新。末場進度已done，status仍待試聽與正式UI；正式write/import/publish/deploy flags皆false。

新 `image-prompts.json` 四selectedPath/hash與promptPath匹配存在；`package-validation.json` 四結果皆shared/offline valid、素材完整、formalImported false，targetCount/spans與實測一致。最後再核對新文件中的61本機link/path無缺；四import-review圖音hash/duration一致。`git diff --check`再次通過。

完整實測資料：`/private/tmp/mcdonalds-assets-final-readback.json`；可重跑檢查：`python3 /private/tmp/mcdonalds-final-readback.py`（只讀repo，寫tmp结果，不連DB）。
