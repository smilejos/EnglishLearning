# 新九場 revision 2 文字與底圖核驗

2026-10-11，fresh-context 唯讀核驗。核驗對象為 `revision-02-texts.json` 定稿，以及每場舊 `*-15-v1/scenario.json` 的實際 `assets.baseImage`。未呼叫生成 API、未連資料庫、未部署、未執行會清表的測試。

文字檔 SHA-256：`e9ac37b5622ecd6f9f8e7269908eb375d259149dbc7219d7e07fc094bcf1135f`。本報告接受下列版本的選詞、詞義及故事；互動標籤排版、錄音與正式套件另行驗收。

## 最終結果

九場皆無剩餘選詞／故事／現有底圖阻斷問題。每場維持 15 個名詞、5 個形容詞，動詞依實際場景為 2–5 個，合計 213 個 target、81 句故事、1,304 個有來源的英文 token。沒有以新增不相干顏色或圖中未呈現的動作補到五個動詞。

| 場次 | 情境 | n／adj／v | 合計 | 實際底圖檔名 |
| --- | --- | --- | --- | --- |
| 01 | living-room | 15／5／4 | 24 | `output/imagegen/living-room-base-2026-10-09-v1/scene-01-living-room-base.png` |
| 02 | breakfast-kitchen | 15／5／2 | 22 | `output/imagegen/basic-advance-01/02-breakfast-kitchen-v1/base-refined.png` |
| 03 | family-dinner | 15／5／4 | 24 | `output/imagegen/basic-advance-01/03-family-dinner-v1/base.png` |
| 04 | tidy-bedroom | 15／5／3 | 23 | `output/imagegen/basic-advance-01/04-tidy-bedroom-v1/base.png` |
| 05 | laundry-day | 15／5／4 | 24 | `output/imagegen/basic-advance-01/05-laundry-day-v1/base-final.png` |
| 06 | classroom-group-work | 15／5／4 | 24 | `output/imagegen/basic-advance-01/06-classroom-group-work-v1/base-refined-2.png` |
| 07 | library-visit | 15／5／5 | 25 | `output/imagegen/basic-advance-01/07-library-visit-v1/base-refined-1.png` |
| 08 | art-class | 15／5／4 | 24 | `output/imagegen/basic-advance-01/08-art-class-v1/base.png` |
| 09 | water-science | 15／5／3 | 23 | `output/imagegen/basic-advance-01/09-water-science-v1/base-refined-2.png` |

## 人工查核與已修正問題

- 01：沙發、閱讀男孩與睡著女孩構成休息情境；read／sleep／sit／rest 可由姿態辨識。電視關閉、安靜的故事符合畫面。
- 02：爸爸煎蛋、孩子切麵包直接呈現 cook／cut；不追加現圖沒有的喝水或抹奶油動作。早餐、廚房均有整場線索。warm 的溫度由早餐故事交代。
- 03：家人圍桌、傍晚窗景與飯菜形成 family／dinner；爸爸進食、爺爺試湯、媽媽端食物形成 eat／taste／serve／share。奶奶一手放腹部、一手示意不用再添，符合 full 的「吃飽」義。
- 04：移除 blue／white；carry／move 改為支援詞。clean 的物件與故事是哥哥擦書桌，full 是右下堆滿衣物的籃子。右側抽屜在衣櫥旁；故事已改 `drawer beside it`（文字檔第 6202 行），沒有再說下方抽屜。put／clean／help 三個目標動詞均有場景線索。
- 05：籃內衣服沒有清楚髒污，原 dirty target 已換 full（文字檔第 7267 行）；左前編織籃衣物堆至籃口並突出，足以支持裝滿衣物籃。dirty／carry 僅是故事支援。洗衣、搓洗、曬衣及協助均在圖中可見。
- 06：尺平放桌前，沒有正在量模型的動作，measure 已降為支援詞（文字檔第 10456 行）。compare 由兩個並列且大小不同的房屋模型、同組學生討論形成線索。school 有窗外校舍；group、answer、model、house 有小組設計與展示圖紙的整場脈絡。
- 07：現圖沒有可讀書名，也不能辨別讀物是小說，title／novel 已換成 screen／floor（文字檔第 10712、10732 行）。查詢電腦螢幕、書架與桌間地板清楚可見；袋子在桌上的畫面符合讓袋子不占地板的故事。library 有大量書架、閱讀桌與借還書櫃台整場線索。
- 08：draw／cut／color／create 均由正在畫圖與剪紙的孩子呈現，paint／glue 採材料名詞。yellow 是製作太陽的黃色圓紙，有創作情境用途；art 有牆上作品與桌上材料的整場線索。
- 09：尺只有刻度線、沒有可讀數字，number 已換 liquid，故事改為觀察液體水位（文字檔第 14461、14930 行）。瓶中液體與中央混色杯清楚可見。blue／yellow 是混色實驗必要顏色；measure／mix／add 皆由尺對照水瓶、雙手倒液體的動作呈現。science／result 有量水、混色、形成綠色的整場線索。

## 機械核驗

以唯讀 `validateScenarioPackage` 在記憶體組合定稿文字與各場舊底圖，九場皆 `valid: true`。檢查 GUID／word、basic／advance 分級、n／adj／v 來源詞性、目標唯一性、故事所有目標覆蓋、每 token span／surface／isTarget，以及底圖路徑與 SHA-256。

另逐場比對 `sourceDefinitionZh` 與 `source/vocabulary-database.json` 的來源 definition 完全一致，並核對所有變形 token 的 aliases；九場皆通過。`I` 以來源正式大寫字形核對。

本次機械組合刻意設 `storyAudio: null`，九場均回報缺故事音檔；這項結果只是文字／來源／底圖核驗，不表示錄音完成或 `publishReady`。未驗收實際新套件的手機／桌機互動標籤遮擋、音檔、字庫音檔或正式匯入狀態。
