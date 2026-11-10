# 字首 S 連音（blends-s）

版本：2026-11-02；第三章教材製作，供接入既有四階段介面。

- 發音主題：/sk sm sn sp st sw/；位置依連音組標籤。
- 目標：聽辨本課連音，完整逐音拼合，再用已教字形拼字。
- 數量：6 組、12 個去重目標詞、3 個示範、8 題（4 聽辨／4 拼字）、2 短句。
- 教材依據：`screenshots/IMG_3263.HEIC`–`IMG_3266.HEIC`（p10–13）子音連音章；取其主題並自編詞表及題句，不複製學生手寫答案。
- 來源修正：p13 的 spring／ng 不作兩個子音連音；本章目標詞不引入 sh／ch／th／ph／wh／tch、ng、ck 或 r 控制母音。
- 共用字庫：逐詞已核對 `source/vocabulary-database.json` 既有 GUID，沒有要求新增詞條；有詞不表示音訊已驗證或正式庫內容已確認。
- 製作範圍：文字及資料檔；音訊由整批盤點，未呼叫生成 API、未寫 DB、未部署。

## 先備與排序

- 先完成字首 L、R 連音。
- 沿用短母音與長母音 i_e／ow（/oʊ/）／ee；不加入尚未教的 sh 或 r 控制母音。

順序按本課列出的連音組，再由簡單常用詞進入已教長母音拼法；不依字長分級。同組是相同字首或字尾的連音組，並非共同母音韻尾字族；程式只沿用 `family` 容器。

## 一、認識聲音

聽 skip、spin、swim 的完整單字。保留字首 /s/，直接接上下一個子音，不在字首加母音。

示範詞：skip、spin、swim。各播整字，目標位置見下表；沒有孤立音素或逐音錄音。

sk／sp／st 的 /k p t/ 接在 /s/ 後通常不送氣；仍是原來的子音，不改寫成 /ɡ b d/。smile、snow、sweet 的母音沿用 i_e／ow／ee，並非本課新規則。

## 二、看字拼讀

目錄：sk → sm → sn → sp → st → sw。第一個連音組為進入時的預設。

| 組別／順序 | 單字與本課詞義 | 音素與結構 | 字形分組 | 目標範圍（0起算、尾端不含） | 作答塊 | 既有 GUID |
| --- | --- | --- | --- | --- | --- | --- |
| sk-／1 | skip：蹦跳；跳過 | /skɪp/；CCVC | s {[0,1)} / k {[1,2)} / i {[2,3)} / p {[3,4)} | [0,2) | s / k / i / p | cf35f2bc-7c41-5af0-8693-37cbd63c3040 |
| sk-／2 | skin：皮膚 | /skɪn/；CCVC | s {[0,1)} / k {[1,2)} / i {[2,3)} / n {[3,4)} | [0,2) | s / k / i / n | b5a7bd1a-91af-5ea7-b02e-460cd3f9de85 |
| sm-／1 | smog：霧霾 | /smɑɡ/；CCVC | s {[0,1)} / m {[1,2)} / o {[2,3)} / g {[3,4)} | [0,2) | s / m / o / g | 872badac-ea3b-55ba-b669-b585ad632638 |
| sm-／2 | smile：微笑 | /smaɪl/；CCVC | s {[0,1)} / m {[1,2)} / i_e {[2,3),[4,5)} / l {[3,4)} | [0,2) | s / m / i / l / e | 94b20084-3dfd-548a-b5c9-eceab251ba3f |
| sn-／1 | snap：啪地折斷 | /snæp/；CCVC | s {[0,1)} / n {[1,2)} / a {[2,3)} / p {[3,4)} | [0,2) | s / n / a / p | da23cd53-7f41-5061-a793-123a072cd5b8 |
| sn-／2 | snow：雪 | /snoʊ/；CCV | s {[0,1)} / n {[1,2)} / ow {[2,4)} | [0,2) | s / n / ow | 859efca1-d77e-5a2a-a543-13a23b8d48c3 |
| sp-／1 | spin：旋轉 | /spɪn/；CCVC | s {[0,1)} / p {[1,2)} / i {[2,3)} / n {[3,4)} | [0,2) | s / p / i / n | ffbc43a2-ef85-5d29-89b9-713002050815 |
| sp-／2 | spot：地點；斑點 | /spɑt/；CCVC | s {[0,1)} / p {[1,2)} / o {[2,3)} / t {[3,4)} | [0,2) | s / p / o / t | ee33ba61-99d3-56bc-b597-2c4aa6be37c3 |
| st-／1 | stop：停下 | /stɑp/；CCVC | s {[0,1)} / t {[1,2)} / o {[2,3)} / p {[3,4)} | [0,2) | s / t / o / p | 25ac6804-4166-5875-9895-86fc60a5dc6b |
| st-／2 | step：一步；台階 | /stɛp/；CCVC | s {[0,1)} / t {[1,2)} / e {[2,3)} / p {[3,4)} | [0,2) | s / t / e / p | 00378a0e-6765-5f41-b9ae-d6a94f55063d |
| sw-／1 | swim：游泳 | /swɪm/；CCVC | s {[0,1)} / w {[1,2)} / i {[2,3)} / m {[3,4)} | [0,2) | s / w / i / m | e8fb0d6e-765d-5fe9-b28a-4aa57912fa6f |
| sw-／2 | sweet：甜的 | /swiːt/；CCVC | s {[0,1)} / w {[1,2)} / ee {[2,4)} / t {[4,5)} | [0,2) | s / w / ee / t | 1c29a1ce-c008-54ab-8ca8-6c9dbda6d953 |

每個音素保留完整，連音目標的兩三個子音不合併成單一 C；`a_e` 等不連續字形的 e 不另計音素。整組播放以目前實際詞數為分母，沿用既有650ms字間、取消及不自動播放行為。

## 三、動手練習

所有正解與聽辨干擾詞均已在本課詞表；沒有未教規則遷移題。聽辨比較目標字首／字尾或已知母音差異，正解位置分散。拼字為字母或已教母音字形塊；重複字母提供獨立可取用塊。播放文字與音訊 key 均為答案整詞，揭曉前按鈕不標答案。

| 題號／ID | 題型 | 正解／播放key | 選項或作答塊 |
| --- | --- | --- | --- |
| 1／blends-s-1-listen | 聽辨選字 | skin | spin、skin、skip |
| 2／blends-s-2-spell | 聽音拼字 | swim | m、i、w、s、n |
| 3／blends-s-3-listen | 聽辨選字 | stop | stop、spot、step |
| 4／blends-s-4-spell | 聽音拼字 | spin | n、p、i、s、k |
| 5／blends-s-5-listen | 聽辨選字 | snow | smile、snap、snow |
| 6／blends-s-6-spell | 聽音拼字 | sweet | t、ee、w、s、n |
| 7／blends-s-7-listen | 聽辨選字 | spot | stop、spot、smog |
| 8／blends-s-8-spell | 聽音拼字 | smile | e、l、i、m、s、n |

確認後沿用介面的正解、詞義與簡短回饋；只計第一次作答，保留錯題重聽、重練與全部重練。

## 四、讀個短句

### 短句 1

- 英文：I can swim.
- 繁中：我會游泳。
- 可點播重點詞：swim；皆為本課目標詞。
- 整句音訊：`sentence-1`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `I can`：我會；can 在片語中可能弱讀。 播放 `I can`，key=`support-i-can`。

### 短句 2

- 英文：Stop and spin on the spot.
- 繁中：停下來，並在原地旋轉。
- 可點播重點詞：stop、spin、spot；皆為本課目標詞。
- 整句音訊：`sentence-2`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `and`：並且；連接兩個動作，常弱讀。 播放 `stop and spin`，key=`support-stop-and-spin`。
- 支援詞／片語 `on the`：在……；on the spot 是在原地。 播放 `on the spot`，key=`support-on-the-spot`。

## 音訊清單與狀態

本課去重播放需求 17 項：12 整詞、2 整句、3 支援片語。跨階段示範／題目／點詞共用整詞 key，不重複計數。

目前全數為「未盤點」，交由批次音訊工具核對既有素材；未確認缺音，不等於全部需要生成。音訊來源、檔案hash／解碼、聲線、文字hash、正式匯入及人工聽審須由實際盤點結果另補，不在此預填通過。

| key | 用途 | 完整文字 | 狀態 |
| --- | --- | --- | --- |
| skip | 整詞 | skip | 未盤點／待人工聽審 |
| skin | 整詞 | skin | 未盤點／待人工聽審 |
| smog | 整詞 | smog | 未盤點／待人工聽審 |
| smile | 整詞 | smile | 未盤點／待人工聽審 |
| snap | 整詞 | snap | 未盤點／待人工聽審 |
| snow | 整詞 | snow | 未盤點／待人工聽審 |
| spin | 整詞 | spin | 未盤點／待人工聽審 |
| spot | 整詞 | spot | 未盤點／待人工聽審 |
| stop | 整詞 | stop | 未盤點／待人工聽審 |
| step | 整詞 | step | 未盤點／待人工聽審 |
| swim | 整詞 | swim | 未盤點／待人工聽審 |
| sweet | 整詞 | sweet | 未盤點／待人工聽審 |
| sentence-1 | 整句 | I can swim. | 未盤點／待人工聽審 |
| support-i-can | 支援片語 | I can | 未盤點／待人工聽審 |
| sentence-2 | 整句 | Stop and spin on the spot. | 未盤點／待人工聽審 |
| support-stop-and-spin | 支援片語 | stop and spin | 未盤點／待人工聽審 |
| support-on-the-spot | 支援片語 | on the spot | 未盤點／待人工聽審 |

音檔預期沿用 `/phonics/blends-s/<key>.mp3`；此為播放契約，不代表檔案已存在。穩定字庫 GUID 如上；音訊素材 GUID／hash 待實際盤點。
