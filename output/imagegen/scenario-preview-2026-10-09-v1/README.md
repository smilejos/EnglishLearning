# 情境圖片效果預覽：第一輪

日期：2026-10-09。五張預覽由內建 `image_gen` 工具各生成一次；原始圖片已保留，這裡保存相同檔案的副本。

本輪依使用者授權比較五種場景的實際效果，採精緻 3D 卡通、寬橫幅、白色手寫英文與箭頭。標籤目前畫在圖片內，供視覺討論；圖片本身尚未接入可點選的網站介面。正式頁面仍可採網頁標籤圖層。

| 編號 | 場景與圖片檔 | 八個目標詞 |
| --- | --- | --- |
| 01 | [午後客廳](scene-01-living-room.png) | sofa, television, lamp, chair, table, read, sleep, comfortable |
| 18 | [花園種植與澆水](scene-18-garden.png) | flower, garden, leaf, pot, plant, water, dry, wet |
| 21 | [雨天等公車](scene-21-rainy-bus-stop.png) | bus, umbrella, raincoat, bench, rain, bag, wait, wet |
| 30 | [球場投球練習](scene-30-basketball.png) | ball, court, net, player, team, throw, jump, excited |
| 31 | [生日派對吹蠟燭](scene-31-birthday.png) | cake, candle, gift, balloon, plate, blow, celebrate, happy |

[完整提示詞與來源檔紀錄](prompts.json) 保存每張實際使用的十區塊英文提示詞、詞表與原始生成路徑；[情境學習需求](../../../docs/scenarios/scenario-learning-requirements.md) 保存故事、播放與單字卡的規劃。

## 審閱重點

- 看物件大小、英文拼字與箭頭位置是否適合兒童閱讀。
- 花園圖用乾裂土與濕潤土呈現 dry／wet；pot 指向容器本身。
- 球場圖用同一投球瞬間呈現 throw／jump，球已離手、雙腳離地。
- wait、comfortable、celebrate 等詞仍需依情境推知；圖片是練習線索，不等於每個詞都可由無文字畫面唯一辨識。
- 雨天圖的 bag 畫成背包，與草稿的提袋有差異；球場圖的 team 括號聚焦後排三人，同款球衣提供隊伍關係線索。後續定稿時可再調整。
- 客廳圖的書封／書脊有微小裝飾字樣，不屬目標詞；正式版若要求完全無額外文字，可在後續修圖或生成提示詞再處理。
- 手寫標籤可作風格參考；正式互動標籤的字體、箭頭與位置還可調整。

本輪沒有生成故事音檔、修改正式資料庫或部署網站。

