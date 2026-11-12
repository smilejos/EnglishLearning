# 機場登機情境底圖 v1

> 歷史素材紀錄：下文保留2026-11-11圖片製作時點的檢查與缺件。2026-11-12已補入canonical詞條、完成映射與座標備料；最新產音與正式匯入狀態請見[匯入準備總表](../../../docs/scenarios/preparation/travel-scenarios-proposal/import-preparation-review.md)。canonical已有不代表正式DB已入庫。

- 場景：`travel-airport-gate`。
- 使用者已授權依提案製作本場底圖，不含音訊、正式DB寫入、匯入、發布或部署。
- 工具：內建 `image_gen.imagegen`，單次新圖生成，未使用CLI fallback。
- 圖片：[base.png](base.png)；完整原始提示詞：[prompt.txt](prompt.txt)；[metadata.json](metadata.json)。
- 尺寸：1672 × 941（約16:9），PNG，2152031 bytes。
- SHA-256：`cfafa477593478c2199cc0616ea2a65b60ff0e2f3bfda33af1a9ae718178b3be`。
- 專案已保存實體副本，原始工具輸出另保留於metadata的sourcePath。

## 實際看圖檢查

明亮溫暖3D卡通風格。未見可辨識文字、數字、詞彙標籤、箭頭、品牌或浮水印。下表是agent實際目視線索；使用者審閱及完整網站互動品質驗收仍待完成。

| 目標詞 | 實際可見線索 |
| --- | --- |
| airport | 落地玻璃窗、停機坪、登機櫃檯與空橋共同呈現機場候機區。 |
| airplane | 窗外的大型客機，可見機身、機尾、機翼與引擎；機首一部分被空橋遮住但仍可辨識。 |
| gate | 右側連入空橋的開放登機入口。 |
| ticket | 男孩右手向地勤出示的白色紙本旅行票證；圖面沒有文字，不單憑外觀辨別票券用途。 |
| passenger | 排隊旅客、男孩與走入空橋的成人。 |
| bag | 中央男士雙手提起的鼓脹深藍旅行袋。 |
| window | 畫面後方可看見客機的大面玻璃窗。 |
| seat | 左前方無人乘坐的藍色候機椅。 |
| line | 男孩、提袋男士與女士依序排在藍色欄帶旁。 |
| screen | 左上方顯示飛機圖示與色塊的壁掛螢幕。 |
| clock | 螢幕正上方的無數字指針鐘。 |
| uniform | 地勤身上的深藍制服與黃色領巾。 |
| busy | 查票、排隊與走入空橋同時進行，繁忙感屬場景語境。 |
| heavy | 男士雙手提起大旅行袋；實際重量不能由圖證明，需故事補足。 |
| empty | 左前候機椅上沒有乘客。 |
| ready | 男孩票證已備妥、另一旅客正進入空橋；準備就緒需語境。 |
| wait | 男士與女士在男孩後方排隊等候。 |
| carry | 男士以雙手提起旅行袋，袋子離地。 |
| check | 地勤將手持讀取器對向男孩出示的票證。 |
| show | 男孩把白色紙本票證伸向地勤。 |
| board | 右側背包旅客背向候機區走入登機空橋，登機方向清楚。 |

## 限制與接續

- ticket採一般票證語意；圖上沒有真實文字或資料，不把外觀當成可辨識機票／登機證的證據。延伸passport未見於本圖；若後續納入為圖上目標需調整，不能直接加標籤。
- busy、heavy、ready的精確語意需故事補足；目前沒有假稱能從圖片量出重量或證明心理狀態。
- 登機通道與窗外客機可見，board指向走入空橋的旅客，不混入安檢或機艙服務。
- 已初步核對主候選線索，不等於標籤、詞卡、旁白、手機UI或完整教材驗收。
- 沒有音訊生成、正式DB／volume核對、匯入、發布或部署。

## 後續詞表擴充

本README的逐詞表記錄原v1生圖時21詞。後續使用者追加空橋、行李運輸車、通道等，現候選為26詞；新增airbridge、passage、terminal、suitcase可在本圖定位，baggage cart未出現且缺正式詞條，需補畫。窗外空橋支撐底盤不能當行李車。本輪沒有改動本PNG或原始prompt，hash不變。詳見[擴充與缺件計畫](../../../docs/scenarios/preparation/travel-scenarios-proposal/airport-facilities-additions.json)。

後續進度：使用者授權補圖後，已生成[機場v2](../travel-airport-gate-base-2026-11-11-v2/base.png)並補入載行李拖車；本v1原圖保留不變。baggage cart的圖像缺件已完成，字庫詞條仍待新增。
