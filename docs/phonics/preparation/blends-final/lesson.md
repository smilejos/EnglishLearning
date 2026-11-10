# 字尾子音連音（blends-final）

版本：2026-11-02；第三章教材製作，供接入既有四階段介面。

- 發音主題：/nd nt mp st ft/；位置依連音組標籤。
- 目標：聽辨本課連音，完整逐音拼合，再用已教字形拼字。
- 數量：5 組、10 個去重目標詞、3 個示範、8 題（4 聽辨／4 拼字）、2 短句。
- 教材依據：`screenshots/IMG_3263.HEIC`–`IMG_3266.HEIC`（p10–13）子音連音章；取其主題並自編詞表及題句，不複製學生手寫答案。
- 來源修正：p13 的 spring／ng 不作兩個子音連音；本章目標詞不引入 sh／ch／th／ph／wh／tch、ng、ck 或 r 控制母音。
- 共用字庫：逐詞已核對 `source/vocabulary-database.json` 既有 GUID，沒有要求新增詞條；有詞不表示音訊已驗證或正式庫內容已確認。
- 製作範圍：文字及資料檔；音訊由整批盤點，未呼叫生成 API、未寫 DB、未部署。

## 先備與排序

- 已學五短母音及基本子音。
- 能從字首兩子音接讀，轉向注意字尾；本課每詞皆不需新的母音拼法。

順序按本課列出的連音組，再由簡單常用詞進入已教長母音拼法；不依字長分級。同組是相同字首或字尾的連音組，並非共同母音韻尾字族；程式只沿用 `family` 容器。

## 一、認識聲音

聽 hand、tent、gift 的完整單字，留意字尾的兩個子音，不漏音，也不在字尾加一個母音。

示範詞：hand、tent、gift。各播整字，目標位置見下表；沒有孤立音素或逐音錄音。

字尾塞音可能不明顯爆破，但要保留收尾位置，不必誇張加上母音。ant 沒有字首子音，結構是 VCC；st 在 nest 是字尾，與上一課 stop 的字首位置不同。ng／ck 不當成兩個音的連音。

## 二、看字拼讀

目錄：nd → nt → mp → st → ft。第一個連音組為進入時的預設。

| 組別／順序 | 單字與本課詞義 | 音素與結構 | 字形分組 | 目標範圍（0起算、尾端不含） | 作答塊 | 既有 GUID |
| --- | --- | --- | --- | --- | --- | --- |
| -nd／1 | hand：手 | /hænd/；CVCC | h {[0,1)} / a {[1,2)} / n {[2,3)} / d {[3,4)} | [2,4) | h / a / n / d | 9c789a02-da62-59ae-b3ff-fc5f2bd655d2 |
| -nd／2 | sand：沙 | /sænd/；CVCC | s {[0,1)} / a {[1,2)} / n {[2,3)} / d {[3,4)} | [2,4) | s / a / n / d | aa0b8079-3bdb-546b-8da6-a95a4ee9df0c |
| -nt／1 | tent：帳篷 | /tɛnt/；CVCC | t {[0,1)} / e {[1,2)} / n {[2,3)} / t {[3,4)} | [2,4) | t / e / n / t | 3d321822-a620-5051-9cda-a10f20b77ed7 |
| -nt／2 | ant：螞蟻 | /ænt/；VCC | a {[0,1)} / n {[1,2)} / t {[2,3)} | [1,3) | a / n / t | 192f0b06-dfbe-5bbb-810c-e3ac89f1c728 |
| -mp／1 | lamp：檯燈 | /læmp/；CVCC | l {[0,1)} / a {[1,2)} / m {[2,3)} / p {[3,4)} | [2,4) | l / a / m / p | 7e26abdd-2a98-5391-91d8-cf1d891c0e78 |
| -mp／2 | camp：營地 | /kæmp/；CVCC | c {[0,1)} / a {[1,2)} / m {[2,3)} / p {[3,4)} | [2,4) | c / a / m / p | 3dfb8841-25d4-5c6a-8c43-243a45506519 |
| -st／1 | nest：鳥巢 | /nɛst/；CVCC | n {[0,1)} / e {[1,2)} / s {[2,3)} / t {[3,4)} | [2,4) | n / e / s / t | 77465cb3-6749-52da-a1a2-e431b9461945 |
| -st／2 | vest：背心 | /vɛst/；CVCC | v {[0,1)} / e {[1,2)} / s {[2,3)} / t {[3,4)} | [2,4) | v / e / s / t | 73993bd3-2434-51d0-bc6a-16f5cb4e1d7c |
| -ft／1 | gift：禮物 | /ɡɪft/；CVCC | g {[0,1)} / i {[1,2)} / f {[2,3)} / t {[3,4)} | [2,4) | g / i / f / t | bb814ace-50b7-5c79-b2e0-7df666a691c6 |
| -ft／2 | left：左邊的 | /lɛft/；CVCC | l {[0,1)} / e {[1,2)} / f {[2,3)} / t {[3,4)} | [2,4) | l / e / f / t | feaa13de-bcb4-5a08-bf9b-0d3b82de9864 |

每個音素保留完整，連音目標的兩三個子音不合併成單一 C；`a_e` 等不連續字形的 e 不另計音素。整組播放以目前實際詞數為分母，沿用既有650ms字間、取消及不自動播放行為。

## 三、動手練習

所有正解與聽辨干擾詞均已在本課詞表；沒有未教規則遷移題。聽辨比較目標字首／字尾或已知母音差異，正解位置分散。拼字為字母或已教母音字形塊；重複字母提供獨立可取用塊。播放文字與音訊 key 均為答案整詞，揭曉前按鈕不標答案。

| 題號／ID | 題型 | 正解／播放key | 選項或作答塊 |
| --- | --- | --- | --- |
| 1／blends-final-1-listen | 聽辨選字 | hand | sand、hand、camp |
| 2／blends-final-2-spell | 聽音拼字 | tent | t、n、e、t、d |
| 3／blends-final-3-listen | 聽辨選字 | nest | nest、vest、left |
| 4／blends-final-4-spell | 聽音拼字 | lamp | p、m、a、l、c |
| 5／blends-final-5-listen | 聽辨選字 | gift | left、vest、gift |
| 6／blends-final-6-spell | 聽音拼字 | sand | d、n、a、s、h |
| 7／blends-final-7-listen | 聽辨選字 | ant | tent、ant、hand |
| 8／blends-final-8-spell | 聽音拼字 | left | t、f、e、l、v |

確認後沿用介面的正解、詞義與簡短回饋；只計第一次作答，保留錯題重聽、重練與全部重練。

## 四、讀個短句

### 短句 1

- 英文：The ant is on my hand.
- 繁中：螞蟻在我的手上。
- 可點播重點詞：ant、hand；皆為本課目標詞。
- 整句音訊：`sentence-1`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `the`：這隻；冠詞常弱讀。 播放 `the ant`，key=`support-the-ant`。
- 支援詞／片語 `is on my`：在我的……上面；my 先聽片語。 播放 `is on my hand`，key=`support-is-on-my-hand`。

### 短句 2

- 英文：Put the lamp in the tent.
- 繁中：把檯燈放進帳篷裡。
- 可點播重點詞：lamp、tent；皆為本課目標詞。
- 整句音訊：`sentence-2`。
- 提示：先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。

- 支援詞／片語 `put the`：把這個……放好；put 的 u 讀 /ʊ/，先聽片語。 播放 `put the lamp`，key=`support-put-the-lamp`。
- 支援詞／片語 `in the`：在……裡面；冠詞常弱讀。 播放 `in the tent`，key=`support-in-the-tent`。

## 音訊清單與狀態

本課去重播放需求 16 項：10 整詞、2 整句、4 支援片語。跨階段示範／題目／點詞共用整詞 key，不重複計數。

目前全數為「未盤點」，交由批次音訊工具核對既有素材；未確認缺音，不等於全部需要生成。音訊來源、檔案hash／解碼、聲線、文字hash、正式匯入及人工聽審須由實際盤點結果另補，不在此預填通過。

| key | 用途 | 完整文字 | 狀態 |
| --- | --- | --- | --- |
| hand | 整詞 | hand | 未盤點／待人工聽審 |
| sand | 整詞 | sand | 未盤點／待人工聽審 |
| tent | 整詞 | tent | 未盤點／待人工聽審 |
| ant | 整詞 | ant | 未盤點／待人工聽審 |
| lamp | 整詞 | lamp | 未盤點／待人工聽審 |
| camp | 整詞 | camp | 未盤點／待人工聽審 |
| nest | 整詞 | nest | 未盤點／待人工聽審 |
| vest | 整詞 | vest | 未盤點／待人工聽審 |
| gift | 整詞 | gift | 未盤點／待人工聽審 |
| left | 整詞 | left | 未盤點／待人工聽審 |
| sentence-1 | 整句 | The ant is on my hand. | 未盤點／待人工聽審 |
| support-the-ant | 支援片語 | the ant | 未盤點／待人工聽審 |
| support-is-on-my-hand | 支援片語 | is on my hand | 未盤點／待人工聽審 |
| sentence-2 | 整句 | Put the lamp in the tent. | 未盤點／待人工聽審 |
| support-put-the-lamp | 支援片語 | put the lamp | 未盤點／待人工聽審 |
| support-in-the-tent | 支援片語 | in the tent | 未盤點／待人工聽審 |

音檔預期沿用 `/phonics/blends-final/<key>.mp3`；此為播放契約，不代表檔案已存在。穩定字庫 GUID 如上；音訊素材 GUID／hash 待實際盤點。
