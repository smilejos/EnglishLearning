# 字首 R 連音（blends-r）

版本：2026-11-02；第三章教材製作，供接入既有四階段介面。

- 發音主題：/br kr dr fr ɡr pr tr/；位置依連音組標籤。
- 目標：聽辨本課連音，完整逐音拼合，再用已教字形拼字。
- 數量：7 組、14 個去重目標詞、3 個示範、8 題（4 聽辨／4 拼字）、2 短句。
- 教材依據：`screenshots/IMG_3263.HEIC`–`IMG_3266.HEIC`（p10–13）子音連音章；取其主題並自編詞表及題句，不複製學生手寫答案。
- 來源修正：p13 的 spring／ng 不作兩個子音連音；本章目標詞不引入 sh／ch／th／ph／wh／tch、ng、ck 或 r 控制母音。
- 共用字庫：逐詞已核對 `source/vocabulary-database.json` 既有 GUID，沒有要求新增詞條；有詞不表示音訊已驗證或正式庫內容已確認。
- 製作範圍：文字及資料檔；音訊由整批盤點，未呼叫生成 API、未寫 DB、未部署。

## 先備與排序

- 先完成字首 L 連音，熟悉兩子音接讀。
- 沿用短母音與已學 ai／ay／ee／a_e；本課 r 在母音前，不引入 r 控制母音。

順序按本課列出的連音組，再由簡單常用詞進入已教長母音拼法；不依字長分級。同組是相同字首或字尾的連音組，並非共同母音韻尾字族；程式只沿用 `family` 容器。

## 一、認識聲音

聽 brain、drum、tree 的完整單字，留意字首先有一個子音，再接 /r/，中間不插入母音。

示範詞：brain、drum、tree。各播整字，目標位置見下表；沒有孤立音素或逐音錄音。

本課採美式讀音。/r/ 不加額外母音；tr、dr 在自然美語中常帶近似 [tʃɹ]、[dʒɹ] 的連讀，仍保留 t／r、d／r 的拼合教學，不寫成 ch／j，也不強求機械分離。frog 示範採 /frɑɡ/，其他口音可能不同。

## 二、看字拼讀

目錄：br → cr → dr → fr → gr → pr → tr。第一個連音組為進入時的預設。

| 組別／順序 | 單字與本課詞義 | 音素與結構 | 字形分組 | 目標範圍（0起算、尾端不含） | 作答塊 | 既有 GUID |
| --- | --- | --- | --- | --- | --- | --- |
| br-／1 | brain：大腦 | /breɪn/；CCVC | b {[0,1)} / r {[1,2)} / ai {[2,4)} / n {[4,5)} | [0,2) | b / r / ai / n | 861ed5e1-84e3-58a1-95af-76ce9bf211dd |
| br-／2 | brave：勇敢的 | /breɪv/；CCVC | b {[0,1)} / r {[1,2)} / a_e {[2,3),[4,5)} / v {[3,4)} | [0,2) | b / r / a / v / e | 0dd4d1e1-c428-5f07-93c6-37db540d116f |
| cr-／1 | crab：螃蟹 | /kræb/；CCVC | c {[0,1)} / r {[1,2)} / a {[2,3)} / b {[3,4)} | [0,2) | c / r / a / b | d769ac9b-8f43-5f8a-b960-2553e8d5f4eb |
| cr-／2 | crop：農作物 | /krɑp/；CCVC | c {[0,1)} / r {[1,2)} / o {[2,3)} / p {[3,4)} | [0,2) | c / r / o / p | 872c163a-13c6-511a-a961-4b9287a18c5c |
| dr-／1 | drip：滴下 | /drɪp/；CCVC | d {[0,1)} / r {[1,2)} / i {[2,3)} / p {[3,4)} | [0,2) | d / r / i / p | 11053f17-2447-5b0d-8f80-7e5079f20b45 |
| dr-／2 | drum：鼓 | /drʌm/；CCVC | d {[0,1)} / r {[1,2)} / u {[2,3)} / m {[3,4)} | [0,2) | d / r / u / m | b2bcc931-5c1e-5f8d-a02b-1123e9a2e19c |
| fr-／1 | frog：青蛙 | /frɑɡ/；CCVC | f {[0,1)} / r {[1,2)} / o {[2,3)} / g {[3,4)} | [0,2) | f / r / o / g | 9e73e71c-87b6-50d4-96d3-ba2b5352dd44 |
| fr-／2 | free：自由的 | /friː/；CCV | f {[0,1)} / r {[1,2)} / ee {[2,4)} | [0,2) | f / r / ee | ac695b43-6b36-5623-a553-29cd262468e1 |
| gr-／1 | grin：咧嘴笑 | /ɡrɪn/；CCVC | g {[0,1)} / r {[1,2)} / i {[2,3)} / n {[3,4)} | [0,2) | g / r / i / n | f054aa3e-2733-5ef8-82b5-95c71dbef2f2 |
| gr-／2 | grab：抓住 | /ɡræb/；CCVC | g {[0,1)} / r {[1,2)} / a {[2,3)} / b {[3,4)} | [0,2) | g / r / a / b | c7cbb969-5ffb-52e2-b07a-09403ec24cec |
| pr-／1 | prop：支撐物 | /prɑp/；CCVC | p {[0,1)} / r {[1,2)} / o {[2,3)} / p {[3,4)} | [0,2) | p / r / o / p | e8c60912-3645-5d7f-a299-f124078fc600 |
| pr-／2 | pray：祈禱 | /preɪ/；CCV | p {[0,1)} / r {[1,2)} / ay {[2,4)} | [0,2) | p / r / ay | da8a5a63-19a0-5645-9336-801351980f69 |
| tr-／1 | trap：陷阱 | /træp/；CCVC | t {[0,1)} / r {[1,2)} / a {[2,3)} / p {[3,4)} | [0,2) | t / r / a / p | cd2754f6-a4ed-5f5c-bdf0-58f5f101d2f6 |
| tr-／2 | tree：樹 | /triː/；CCV | t {[0,1)} / r {[1,2)} / ee {[2,4)} | [0,2) | t / r / ee | cb47822e-87eb-548c-aa51-38d562f80ee3 |

每個音素保留完整，連音目標的兩三個子音不合併成單一 C；`a_e` 等不連續字形的 e 不另計音素。整組播放以目前實際詞數為分母，沿用既有650ms字間、取消及不自動播放行為。

## 三、動手練習

所有正解與聽辨干擾詞均已在本課詞表；沒有未教規則遷移題。聽辨比較目標字首／字尾或已知母音差異，正解位置分散。拼字為字母或已教母音字形塊；重複字母提供獨立可取用塊。播放文字與音訊 key 均為答案整詞，揭曉前按鈕不標答案。

| 題號／ID | 題型 | 正解／播放key | 選項或作答塊 |
| --- | --- | --- | --- |
| 1／blends-r-1-listen | 聽辨選字 | crab | grab、crab、trap |
| 2／blends-r-2-spell | 聽音拼字 | drum | m、r、u、d、i |
| 3／blends-r-3-listen | 聽辨選字 | brain | brain、brave、pray |
| 4／blends-r-4-spell | 聽音拼字 | tree | ee、r、t、f |
| 5／blends-r-5-listen | 聽辨選字 | prop | crop、trap、prop |
| 6／blends-r-6-spell | 聽音拼字 | grab | b、a、r、g、c |
| 7／blends-r-7-listen | 聽辨選字 | drip | grin、drip、drum |
| 8／blends-r-8-spell | 聽音拼字 | pray | ay、r、p、b |

確認後沿用介面的正解、詞義與簡短回饋；只計第一次作答，保留錯題重聽、重練與全部重練。

## 四、讀個短句

### 短句 1

- 英文：The frog is in the tree.
- 繁中：青蛙在樹上。
- 可點播重點詞：frog、tree；皆為本課目標詞。
- 整句音訊：`sentence-1`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `the`：這隻／這棵；冠詞常弱讀。 播放 `the frog`，key=`support-the-frog`。
- 支援詞／片語 `is in the`：在……裡；本句 in the tree 表示在樹上，先聽片語。 播放 `is in the tree`，key=`support-is-in-the-tree`。

### 短句 2

- 英文：Grab the drum and play.
- 繁中：拿起鼓來演奏。
- 可點播重點詞：grab、drum；皆為本課目標詞。
- 整句音訊：`sentence-2`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `the`：這個；冠詞常弱讀。 播放 `the drum`，key=`support-the-drum`。
- 支援詞／片語 `and play`：並演奏；play 複習先前的 ay。 播放 `and play`，key=`support-and-play`。

## 音訊清單與狀態

本課去重播放需求 20 項：14 整詞、2 整句、4 支援片語。跨階段示範／題目／點詞共用整詞 key，不重複計數。

目前全數為「未盤點」，交由批次音訊工具核對既有素材；未確認缺音，不等於全部需要生成。音訊來源、檔案hash／解碼、聲線、文字hash、正式匯入及人工聽審須由實際盤點結果另補，不在此預填通過。

| key | 用途 | 完整文字 | 狀態 |
| --- | --- | --- | --- |
| brain | 整詞 | brain | 未盤點／待人工聽審 |
| brave | 整詞 | brave | 未盤點／待人工聽審 |
| crab | 整詞 | crab | 未盤點／待人工聽審 |
| crop | 整詞 | crop | 未盤點／待人工聽審 |
| drip | 整詞 | drip | 未盤點／待人工聽審 |
| drum | 整詞 | drum | 未盤點／待人工聽審 |
| frog | 整詞 | frog | 未盤點／待人工聽審 |
| free | 整詞 | free | 未盤點／待人工聽審 |
| grin | 整詞 | grin | 未盤點／待人工聽審 |
| grab | 整詞 | grab | 未盤點／待人工聽審 |
| prop | 整詞 | prop | 未盤點／待人工聽審 |
| pray | 整詞 | pray | 未盤點／待人工聽審 |
| trap | 整詞 | trap | 未盤點／待人工聽審 |
| tree | 整詞 | tree | 未盤點／待人工聽審 |
| sentence-1 | 整句 | The frog is in the tree. | 未盤點／待人工聽審 |
| support-the-frog | 支援片語 | the frog | 未盤點／待人工聽審 |
| support-is-in-the-tree | 支援片語 | is in the tree | 未盤點／待人工聽審 |
| sentence-2 | 整句 | Grab the drum and play. | 未盤點／待人工聽審 |
| support-the-drum | 支援片語 | the drum | 未盤點／待人工聽審 |
| support-and-play | 支援片語 | and play | 未盤點／待人工聽審 |

音檔預期沿用 `/phonics/blends-r/<key>.mp3`；此為播放契約，不代表檔案已存在。穩定字庫 GUID 如上；音訊素材 GUID／hash 待實際盤點。
