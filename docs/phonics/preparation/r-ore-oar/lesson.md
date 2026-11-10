# R 控制母音 ore／oar教材（r-ore-oar）

2026-11-02，自編第一版；參照照片的教學範圍，依目前平台的先備與四階段重編，未抄用手寫答案。

## 課程設定

- 順序：五長短母音 → 第3章子音連綴 → 第4章子音字形 → ar → or → ore／oar。
- 目標聲音：/ɔ/＋/r/，採美式示範；拼法：ore → oar。
- 學習目標：沿用or的聲音，比較ore與oar兩種拼法。
- 教材來源：`screenshots/IMG_3301.HEIC`（p198）、`IMG_3302.HEIC`（p199）；範圍參照原書，詞表、題目及短句為本批自編。
- 數量：3個實際韻尾字族，9個去重目標詞；3示範、8題（4聽音選字／4聽音拼字）、2短句。
- 製作範圍：前台教材接入的內容備料；實際接入、音訊生成、正式字庫回補、部署與人工品質驗收分開記錄。
- 共用字庫：逐詞GUID見下表，沿用既有詞條；本文件不代表已寫入正式庫。
- 先備：已學五長短母音、第3章連綴與第4章sh/ch等子音字形。
- 先備：本章採美式捲舌讀音；/r/明列為一個子音C，字形與音素不要求一對一。
- 先備：已教ar、or及sh/st連綴；本課新增ore/oar同音拼法。
- 先備：sore與soar同音，聽音選字不把兩者放在同一題；拼字依本課目標單詞文字對應示範。

## 一、認識聲音

聽 store、oar、board 的完整單字，留意 /ɔ/＋/r/；先看本課目標字形，再完整逐音拼合。

ore與oar在本課都表示/ɔ/接/r/，整組字形可對應兩音；/r/仍算C。ore不拆成長O的o_e，oar也不套用oa=/oʊ/。

播放完整單字，留意其中的目標聲音。沒有合格孤立音素錄音，不把音素文字或TTS字母名稱當成逐音音訊。

| 示範詞 | 詞義 | 目標位置（0起算、終點不含） | 播放 |
| --- | --- | --- | --- |
| store | 商店 | [2,5) | `r-ore-oar/store`，完整單字 |
| oar | 船槳 | [0,3) | `r-ore-oar/oar`，完整單字 |
| board | 木板 | [1,4) | `r-ore-oar/board`，完整單字 |

## 二、看字拼讀

先選第一字族第一詞，不自動播放。先同族變換字首，再比較不同韻尾；基本單子音在前，已教連綴在後。單詞仍逐音拼合，不能只記字族猜字。

本章字形ar／or／ore／oar各以完整相連字形標記，分別對應母音加/r/兩個音素；結構以音素計算，/r/是一個C。字形塊數與音素數可以不同。ore不拆成o_e，也不套用長O；oar不直接套oa的/oʊ/規則。

### 1. ore → -ore（5詞）

識別：`r-ore-oar-ore-1`；共同韻尾：/ɔr/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. more | 更多的 | /m / ɔ / r/ | CVC | m [0,1)／ore [1,4) | [1,4) | m／ore | 66f118af-d262-5cc8-8a87-78bb5102ddca |
| 2. sore | 疼痛的 | /s / ɔ / r/ | CVC | s [0,1)／ore [1,4) | [1,4) | s／ore | cc33fe2f-d9aa-5f69-921a-77e15405bab9 |
| 3. core | 核心；果核 | /k / ɔ / r/ | CVC | c [0,1)／ore [1,4) | [1,4) | c／ore | 76af0155-b27c-52fe-b15e-3a065fb5464a |
| 4. shore | 岸邊 | /ʃ / ɔ / r/ | CVC | sh [0,2)／ore [2,5) | [2,5) | sh／ore | 285bd114-004a-5cf1-9b5c-d7b502acec33 |
| 5. store | 商店 | /s / t / ɔ / r/ | CCVC | s [0,1)／t [1,2)／ore [2,5) | [2,5) | s／t／ore | b2bf583f-2b66-56aa-abe8-a8f0fe006771 |

### 2. oar → -oar（3詞）

識別：`r-ore-oar-oar-2`；共同韻尾：/ɔr/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. oar | 船槳 | /ɔ / r/ | VC | oar [0,3) | [0,3) | oar | 048e3d74-d5fe-51a1-85cd-079d1fd684ef |
| 2. roar | 吼叫 | /r / ɔ / r/ | CVC | r [0,1)／oar [1,4) | [1,4) | r／oar | e6db247b-51f1-5cb4-ac19-2f7ee4290301 |
| 3. soar | 高飛；翱翔 | /s / ɔ / r/ | CVC | s [0,1)／oar [1,4) | [1,4) | s／oar | 03c8ca23-e40f-5fa1-be70-d26c0ee423a3 |

### 3. oar → -oard（1詞）

識別：`r-ore-oar-oar-3`；共同韻尾：/ɔrd/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. board | 木板 | /b / ɔ / r / d/ | CVCC | b [0,1)／oar [1,4)／d [4,5) | [1,4) | b／oar／d | f813645b-5fc5-5c97-b02a-684b14dd9f63 |

各字族按實際詞數播放；650ms字間隔、0.8倍速、個別改播與停止沿用現有介面。切換拼法／字族／結構即取消舊音訊與佇列，重設新詞表第一詞且不自動播放；空詞表停用播放。

## 三、動手練習

答案與選字干擾詞都在本課第二階段明示；沒有未教遷移詞。干擾以字首／字尾／母音差異比較，不將同音異字放在同一聽選題。

| 題目ID | 題型 | 播放與正解 | 選項／作答塊 | 來源拼法／字族／結構 |
| --- | --- | --- | --- | --- |
| r-ore-oar-1-listen | 聽音選字 | `r-ore-oar/store` → store | shore／store／more | ore／-ore／CCVC |
| r-ore-oar-2-spell | 聽音拼字 | `r-ore-oar/board` → board | d／oar／b／p | oar／-oard／CVCC |
| r-ore-oar-3-listen | 聽音選字 | `r-ore-oar/core` → core | core／more／sore | ore／-ore／CVC |
| r-ore-oar-4-spell | 聽音拼字 | `r-ore-oar/roar` → roar | oar／r／p | oar／-oar／CVC |
| r-ore-oar-5-listen | 聽音選字 | `r-ore-oar/soar` → soar | oar／board／soar | oar／-oar／CVC |
| r-ore-oar-6-spell | 聽音拼字 | `r-ore-oar/shore` → shore | ore／sh／p | ore／-ore／CVC |
| r-ore-oar-7-listen | 聽音選字 | `r-ore-oar/more` → more | more／core／store | ore／-ore／CVC |
| r-ore-oar-8-spell | 聽音拼字 | `r-ore-oar/oar` → oar | oar／p | oar／-oar／VC |

確認前可改選／清除；確認後呈現正解、上表詞義及重聽提示。第一次作答統計本輪結果，可只練錯題或重練全部，離開練習重設，不保存跨次成績。沒有麥克風、自動評分或收藏。

sore與soar在本課同音，不互為聽選干擾。先以詞義與拼法各自示範；此批拼字題未以這對同音詞作純聽辨。

## 四、讀個短句

### The oar is on the shore.

船槳在岸邊。

重點詞：oar、shore；整句音訊：`r-ore-oar/sentence-1`。

先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。

- `support-1-1`：**the oar**；這個／那個；冠詞通常弱讀。
- `support-1-2`：**is on the shore**；是／在；s在此讀/z/，先聽片語。
### The board is in the store.

木板在商店裡。

重點詞：board、store；整句音訊：`r-ore-oar/sentence-2`。

先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。

- `support-2-1`：**the board**；這個／那個；冠詞通常弱讀。
- `support-2-2`：**is in the store**；是／在；s在此讀/z/，先聽片語。

## 音訊需求與共用字庫

整批實際結果見[製作與驗收](../phonics-345/review.md)、[音訊盤點](../phonics-345/audio-inventory.md)、[技術驗證](../phonics-345/audio-verification.json)及[字庫回補](../phonics-345/wordbank-review.md)。下表保留初始備料快照，最新音訊狀態以整批文件為準。

每項去重需求只算一次，示範、題目與點詞重用整詞音。以下是內容備料時的清單；未盤點不等於確認缺音。實際重用／補缺與檔案驗證以整批紀錄為準，不在前台開頁時生成。

| Key | 類型 | 完整文字 | 備料狀態／人工聽審 |
| --- | --- | --- | --- |
| more | 整詞 | more | 未盤點／未聽審 |
| sore | 整詞 | sore | 未盤點／未聽審 |
| core | 整詞 | core | 未盤點／未聽審 |
| shore | 整詞 | shore | 未盤點／未聽審 |
| store | 整詞 | store | 未盤點／未聽審 |
| oar | 整詞 | oar | 未盤點／未聽審 |
| roar | 整詞 | roar | 未盤點／未聽審 |
| soar | 整詞 | soar | 未盤點／未聽審 |
| board | 整詞 | board | 未盤點／未聽審 |
| sentence-1 | 整句 | The oar is on the shore. | 未盤點／未聽審 |
| support-1-1 | 支援片語 | the oar | 未盤點／未聽審 |
| support-1-2 | 支援片語 | is on the shore | 未盤點／未聽審 |
| sentence-2 | 整句 | The board is in the store. | 未盤點／未聽審 |
| support-2-1 | 支援片語 | the board | 未盤點／未聽審 |
| support-2-2 | 支援片語 | is in the store | 未盤點／未聽審 |

本課共15項去重播放需求。音訊來源、原設定、文字hash、檔案hash、時長、實體檔驗證與人工發音聽審分開保存；沒有孤立音素／逐音拼合音訊。

## 待驗項目

- 前台與全批接入驗證見本課review及整批紀錄；本文件不單獨宣稱已部署。
- 人工試聽逐詞目標音、字首字尾及句子自然度，尚未完成。
- 桌機／手機需確認最長單詞、VC等實際結構、字形塊、多字母高亮、換組停止與播放失敗提示。
