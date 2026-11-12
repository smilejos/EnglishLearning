# 旅遊四場 fresh-context read-back

本次僅Repo靜態讀取與Python核對；無連DB、LAN、Docker、生成、匯入、發布或部署。未改Repo檔案，未重跑長套測試。

## 結論

核心資料與離線匯入準備一致，未發現阻斷性的資料錯誤；音訊仍進行中，不把資料結構完整性或publishReady當作品質發布結論。動態進度與後續變更以root最後生成的manifest/package為準。

- 四場各26/29/19/29詞，合103詞次，去重92詞。
- 各8/9/6/10句，合33；各73/107/64/111英文tokens，合355；各72/104/64/106 wordLinks，合346。
- 全部target及全文link GUID與canonical對應，所有目標均被isTarget link覆蓋；全文每個英文字母都有link範圍，start/end與surface完全相符。
- 8種多詞目標（baggage cart、front desk、key card、check in、flight attendant、overhead bin、business class、economy class）全以完整片語映射。
- batch、prepared-texts、scenario targets在GUID、教學詞性、詞義一致，故事文本與逐句資料一致。
- 四場103個interaction與interactions.json完全相同且0..1範圍有效；本次未獨立讀圖作視覺判斷。
- 四圖的baseImage/referenceImage SHA-256與實際檔案一致；總表及四份import-review的Markdown相對連結均有效。
- canonical實際9247；原備份9244筆深比較相同，備份hash正確。3新詞完整內容與delta相同，均3解釋+3中英例句；boat/pen/sit/board僅id/guid/word/examples最小增量，每筆1例句。既有canonical當時本已含這4例句，正式補缺目標是正式DB，並未重改canonical。
- source id9254–9256/GUID/word的唯讀查核證據rows=[]；總表明確寫未正式入庫且匯入前重查。
- 音訊計畫groups共313次引用、278唯一assetGuid；重複GUID之內容完全一致。全部job textHash正確、profile路徑正確，canonicalSha256吻合。
- 435既有+7待補metadata+278新產=720項wordbank，另4旁白；計畫1.7B profile2706fd2bc0c87488，未假用舊0.6B身份。
- 產音工具預設dry-run，--generate+TRAVEL_TTS_REAL=1雙opt-in、來源hash與package驗證、逐場失敗即停、故事與canonical生成後重查；寫入僅repo data備料/套件/報告，靜態未見DB或volume寫入。
- Gradio工具僅private LAN/loopback origin、同origin下載、禁止redirect與逃逸路徑、SSE及音訊大小限制、timeout/abort與MP3/WAV guard。未呼叫真服務。
- 審閱文件明確標示CUA host unavailable、沒有瀏覽器/手機/_test UI實跑；人工聽審未完成。

## 需修正的歷史敘述

output/imagegen/travel-airport-gate-base-2026-11-11-v2/README.md:49：「字庫完整詞條仍缺，GUID=null」。
output/imagegen/travel-airplane-cabin-base-2026-11-11-v1/README.md:49：「完整詞條尚缺，GUID維持null」。
output/imagegen/travel-airport-gate-base-2026-11-11-v1/README.md:51：「字庫詞條仍待新增」。

上述圖片README未如本批review.md設歷史時點banner；建議頁首先說這是2026-11-11圖片製作紀錄，最新canonical補詞、映射、座標與產音進度見匯入準備總表。保留原始圖片紀錄即可，無需改原圖或prompt。

初讀時另看到3份v1素材import-review沿用「圖片v2不是正式教材revision2」，及架構導覽第1節canonical9244；root已於查讀期間修正，後續rg不再找到，故不列未解項。

## 驗證限制

未重做正式庫/volume核對、獨立UI、音訊聽審、或已有933+typecheck/34工具測試；相關聲明僅檢查既有記錄，不能宣稱本read-back重跑。總表22/278是時間戳snapshot，允許落後，最後交付前應更新當下實際進度。

## 修正後差異回看

root已完成上述修正；本read-back再次確認5份travel圖片README第3行均新增歷史時點banner、連到目前存在的匯入準備總表並明示canonical不等於正式DB。四份import-review第7行已分清圖片素材與教材revision；架構導覽第48行已分2026-11-08舊9244與目前9247/27793/33170/max9256，並分清43詞差距中的旅遊3詞與其他phonics40詞。以上項目均已結案，沒有剩餘文件修正要求。
