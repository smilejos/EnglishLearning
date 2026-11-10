# 字首三子音連音（blends-three）

版本：2026-11-02；第三章教材製作，供接入既有四階段介面。

- 發音主題：/skr spl spr str/；位置依連音組標籤。
- 目標：聽辨本課連音，完整逐音拼合，再用已教字形拼字。
- 數量：4 組、6 個去重目標詞、3 個示範、8 題（4 聽辨／4 拼字）、2 短句。
- 教材依據：`screenshots/IMG_3263.HEIC`–`IMG_3266.HEIC`（p10–13）子音連音章；取其主題並自編詞表及題句，不複製學生手寫答案。
- 來源修正：p13 的 spring／ng 不作兩個子音連音；本章目標詞不引入 sh／ch／th／ph／wh／tch、ng、ck 或 r 控制母音。
- 共用字庫：逐詞已核對 `source/vocabulary-database.json` 既有 GUID，沒有要求新增詞條；有詞不表示音訊已驗證或正式庫內容已確認。
- 製作範圍：文字及資料檔；音訊由整批盤點，未呼叫生成 API、未寫 DB、未部署。

## 先備與排序

- 先完成前三堂字首兩子音與字尾連音。
- spray 沿用長 A 的 ay；其餘用已學短母音。不以尚未教的 sh、ng、ck 或 r 控制母音當先備。

順序按本課列出的連音組，再由簡單常用詞進入已教長母音拼法；不依字長分級。同組是相同字首或字尾的連音組，並非共同母音韻尾字族；程式只沿用 `family` 容器。

spl-、spr- 各先選 1 個現有常用詞，不為對齊詞量加入缺詞或尚未教的 sh／ng；八題可以跨題型重用同一已教詞。

## 一、認識聲音

聽 scrap、split、spray 的完整單字，留意字首三個子音依序接讀，三個音之間不加母音。

示範詞：scrap、split、spray。各播整字，目標位置見下表；沒有孤立音素或逐音錄音。

scr 的 c 讀 /k/；三個字母各保留一個子音，不能當成 sh 那樣的一個音。str 的 tr 自然連讀沿用 R 連音說明。spray 沒有字尾子音，按音素標 CCCV。只聽完整單字，不宣稱有孤立音素錄音。

## 二、看字拼讀

目錄：scr → spl → spr → str。第一個連音組為進入時的預設。

| 組別／順序 | 單字與本課詞義 | 音素與結構 | 字形分組 | 目標範圍（0起算、尾端不含） | 作答塊 | 既有 GUID |
| --- | --- | --- | --- | --- | --- | --- |
| scr-／1 | scrap：碎片；廢料 | /skræp/；CCCVC | s {[0,1)} / c {[1,2)} / r {[2,3)} / a {[3,4)} / p {[4,5)} | [0,3) | s / c / r / a / p | e12e02ac-4db3-5b4c-a4d3-7f78ff005a5e |
| scr-／2 | scrub：用力刷洗 | /skrʌb/；CCCVC | s {[0,1)} / c {[1,2)} / r {[2,3)} / u {[3,4)} / b {[4,5)} | [0,3) | s / c / r / u / b | b7642d71-0bc9-5e60-b3f2-6eb932fa4ffe |
| spl-／1 | split：分開；分割 | /splɪt/；CCCVC | s {[0,1)} / p {[1,2)} / l {[2,3)} / i {[3,4)} / t {[4,5)} | [0,3) | s / p / l / i / t | db098ce1-2387-55c6-ac2d-6c530f5acedf |
| spr-／1 | spray：噴灑；噴霧 | /spreɪ/；CCCV | s {[0,1)} / p {[1,2)} / r {[2,3)} / ay {[3,5)} | [0,3) | s / p / r / ay | 3c2b25f0-5291-5007-a151-719605a14cad |
| str-／1 | strap：帶子；肩帶 | /stræp/；CCCVC | s {[0,1)} / t {[1,2)} / r {[2,3)} / a {[3,4)} / p {[4,5)} | [0,3) | s / t / r / a / p | c6a73631-a096-5563-bdde-30a9f8c5ad28 |
| str-／2 | strip：長條 | /strɪp/；CCCVC | s {[0,1)} / t {[1,2)} / r {[2,3)} / i {[3,4)} / p {[4,5)} | [0,3) | s / t / r / i / p | 14d0f9ed-4e28-5e2d-8b6b-7a1da0a0925b |

每個音素保留完整，連音目標的兩三個子音不合併成單一 C；`a_e` 等不連續字形的 e 不另計音素。整組播放以目前實際詞數為分母，沿用既有650ms字間、取消及不自動播放行為。

## 三、動手練習

所有正解與聽辨干擾詞均已在本課詞表；沒有未教規則遷移題。聽辨比較目標字首／字尾或已知母音差異，正解位置分散。拼字為字母或已教母音字形塊；重複字母提供獨立可取用塊。播放文字與音訊 key 均為答案整詞，揭曉前按鈕不標答案。

| 題號／ID | 題型 | 正解／播放key | 選項或作答塊 |
| --- | --- | --- | --- |
| 1／blends-three-1-listen | 聽辨選字 | scrap | strap、scrap、scrub |
| 2／blends-three-2-spell | 聽音拼字 | split | t、i、l、p、s、r |
| 3／blends-three-3-listen | 聽辨選字 | spray | spray、strap、strip |
| 4／blends-three-4-spell | 聽音拼字 | scrub | b、u、r、c、s、a |
| 5／blends-three-5-listen | 聽辨選字 | strip | strap、split、strip |
| 6／blends-three-6-spell | 聽音拼字 | spray | ay、r、p、s、t |
| 7／blends-three-7-listen | 聽辨選字 | strap | scrap、strap、strip |
| 8／blends-three-8-spell | 聽音拼字 | scrap | p、a、r、c、s、u |

確認後沿用介面的正解、詞義與簡短回饋；只計第一次作答，保留錯題重聽、重練與全部重練。

## 四、讀個短句

### 短句 1

- 英文：Cut a strip.
- 繁中：剪下一條長條。
- 可點播重點詞：strip；皆為本課目標詞。
- 整句音訊：`sentence-1`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `cut a`：剪下一條；cut 用已學短 u，冠詞 a 常弱讀。 播放 `cut a`，key=`support-cut-a`。

### 短句 2

- 英文：Spray the tub and scrub.
- 繁中：朝浴缸噴灑清潔噴霧，再用力刷洗。
- 可點播重點詞：spray、scrub；皆為本課目標詞。
- 整句音訊：`sentence-2`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `the tub`：這個浴缸；tub 用已學短 u，冠詞常弱讀。 播放 `the tub`，key=`support-the-tub`。
- 支援詞／片語 `and`：並且；連接兩個動作，常弱讀。 播放 `and scrub`，key=`support-and-scrub`。

## 音訊清單與狀態

本課去重播放需求 11 項：6 整詞、2 整句、3 支援片語。跨階段示範／題目／點詞共用整詞 key，不重複計數。

目前全數為「未盤點」，交由批次音訊工具核對既有素材；未確認缺音，不等於全部需要生成。音訊來源、檔案hash／解碼、聲線、文字hash、正式匯入及人工聽審須由實際盤點結果另補，不在此預填通過。

| key | 用途 | 完整文字 | 狀態 |
| --- | --- | --- | --- |
| scrap | 整詞 | scrap | 未盤點／待人工聽審 |
| scrub | 整詞 | scrub | 未盤點／待人工聽審 |
| split | 整詞 | split | 未盤點／待人工聽審 |
| spray | 整詞 | spray | 未盤點／待人工聽審 |
| strap | 整詞 | strap | 未盤點／待人工聽審 |
| strip | 整詞 | strip | 未盤點／待人工聽審 |
| sentence-1 | 整句 | Cut a strip. | 未盤點／待人工聽審 |
| support-cut-a | 支援片語 | cut a | 未盤點／待人工聽審 |
| sentence-2 | 整句 | Spray the tub and scrub. | 未盤點／待人工聽審 |
| support-the-tub | 支援片語 | the tub | 未盤點／待人工聽審 |
| support-and-scrub | 支援片語 | and scrub | 未盤點／待人工聽審 |

音檔預期沿用 `/phonics/blends-three/<key>.mp3`；此為播放契約，不代表檔案已存在。穩定字庫 GUID 如上；音訊素材 GUID／hash 待實際盤點。
