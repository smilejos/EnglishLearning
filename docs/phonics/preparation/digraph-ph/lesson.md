# 子音字形 ph教材（digraph-ph）

2026-11-02，自編第一版；參照照片的教學範圍，依目前平台的先備與四階段重編，未抄用手寫答案。

## 課程設定

- 順序：五長短母音 → 第3章子音連綴 → sh → ch → 無聲th → 有聲th → wh → ph → tch／ch比較。
- 目標聲音：/f/，採美式示範；拼法：ph。
- 學習目標：用四個合適單詞認識ph=/f/，不以多音節湊數。
- 教材來源：`screenshots/IMG_3294.HEIC`（p136）、`IMG_3295.HEIC`（p137）、`IMG_3296.HEIC`（頁碼未入鏡）；範圍參照原書，詞表、題目及短句為本批自編。
- 數量：3個實際韻尾字族，4個去重目標詞；3示範、8題（4聽音選字／4聽音拼字）、2短句。
- 製作範圍：前台教材接入的內容備料；實際接入、音訊生成、正式字庫回補、部署與人工品質驗收分開記錄。
- 共用字庫：逐詞GUID見下表，沿用既有詞條；本文件不代表已寫入正式庫。
- 先備：已學五長短母音、基本單字母子音及第3章雙子音連綴。
- 先備：同一字形可含多個字母；拼字作答塊與音素數量分開看。
- 先備：已學長A的a_e、長O的o_e以及gr/fr連綴。
- 先備：phase/phrase的s=/z/先明示，本課不將photo、dolphin等尚未教音節規則列為考題。
- 份量理由：只收先備可承接的常用詞，不為配額加入未教母音、多音節或不穩定口音變體。

## 一、認識聲音

聽 phone、graph、phrase 的完整單字，留意 /f/；先看本課目標字形，再完整逐音拼合。

ph在本課讀/f/，只算一個C。phase/phrase的a_e讀/eɪ/，s在這兩詞讀/z/，先聽整字提示。phone的o_e是已學長O。

播放完整單字，留意其中的目標聲音。沒有合格孤立音素錄音，不把音素文字或TTS字母名稱當成逐音音訊。

| 示範詞 | 詞義 | 目標位置（0起算、終點不含） | 播放 |
| --- | --- | --- | --- |
| phone | 電話 | [0,2) | `digraph-ph/phone`，完整單字 |
| graph | 圖表 | [3,5) | `digraph-ph/graph`，完整單字 |
| phrase | 片語 | [0,2) | `digraph-ph/phrase`，完整單字 |

## 二、看字拼讀

先選第一字族第一詞，不自動播放。先同族變換字首，再比較不同韻尾；基本單子音在前，已教連綴在後。單詞仍逐音拼合，不能只記字族猜字。

多字母子音字形表示一個C；既有a_e／i_e／o_e以不連續範圍表示，原單字維持正常字序。拼字塊保留實際連續字母順序，不能以字母數代替作答塊數。

### 1. ph → -one（1詞）

識別：`digraph-ph-ph-1`；共同韻尾：/oʊn/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. phone | 電話 | /f / oʊ / n/ | CVC | ph [0,2)／o_e [2,3)＋[4,5)／n [3,4) | [0,2) | ph／o／n／e | f8aeec9a-9075-5df7-9f02-338649ea40d5 |

### 2. ph → -aph（1詞）

識別：`digraph-ph-ph-2`；共同韻尾：/æf/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. graph | 圖表 | /ɡ / r / æ / f/ | CCVC | g [0,1)／r [1,2)／a [2,3)／ph [3,5) | [3,5) | g／r／a／ph | d172f335-6012-595e-90b9-0d22862526aa |

### 3. ph → -ase（2詞）

識別：`digraph-ph-ph-3`；共同韻尾：/eɪz/。phase與phrase都用a_e；s讀/z/。phrase的/f/、/r/都保留，與phase比較字首。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. phase | 階段 | /f / eɪ / z/ | CVC | ph [0,2)／a_e [2,3)＋[4,5)／s [3,4) | [0,2) | ph／a／s／e | 56bd6da6-88e0-5466-81f1-e5cea584e2d2 |
| 2. phrase | 片語 | /f / r / eɪ / z/ | CCVC | ph [0,2)／r [2,3)／a_e [3,4)＋[5,6)／s [4,5) | [0,2) | ph／r／a／s／e | e88870de-d3dc-5389-9926-18e9f1064d2f |

各字族按實際詞數播放；650ms字間隔、0.8倍速、個別改播與停止沿用現有介面。切換拼法／字族／結構即取消舊音訊與佇列，重設新詞表第一詞且不自動播放；空詞表停用播放。

## 三、動手練習

答案與選字干擾詞都在本課第二階段明示；沒有未教遷移詞。干擾以字首／字尾／母音差異比較，不將同音異字放在同一聽選題。

| 題目ID | 題型 | 播放與正解 | 選項／作答塊 | 來源拼法／字族／結構 |
| --- | --- | --- | --- | --- |
| digraph-ph-1-listen | 聽音選字 | `digraph-ph/phone` → phone | graph／phone／phase | ph／-one／CVC |
| digraph-ph-2-spell | 聽音拼字 | `digraph-ph/phone` → phone | e／n／o／ph／p | ph／-one／CVC |
| digraph-ph-3-listen | 聽音選字 | `digraph-ph/graph` → graph | graph／phase／phrase | ph／-aph／CCVC |
| digraph-ph-4-spell | 聽音拼字 | `digraph-ph/graph` → graph | ph／a／r／g／p | ph／-aph／CCVC |
| digraph-ph-5-listen | 聽音選字 | `digraph-ph/phase` → phase | phrase／phone／phase | ph／-ase／CVC |
| digraph-ph-6-spell | 聽音拼字 | `digraph-ph/phase` → phase | e／s／a／ph／p | ph／-ase／CVC |
| digraph-ph-7-listen | 聽音選字 | `digraph-ph/phrase` → phrase | phase／phrase／graph | ph／-ase／CCVC |
| digraph-ph-8-spell | 聽音拼字 | `digraph-ph/phrase` → phrase | e／s／a／r／ph／p | ph／-ase／CCVC |

確認前可改選／清除；確認後呈現正解、上表詞義及重聽提示。第一次作答統計本輪結果，可只練錯題或重練全部，離開練習重設，不保存跨次成績。沒有麥克風、自動評分或收藏。

## 四、讀個短句

### The phone is on the desk.

電話在書桌上。

重點詞：phone；整句音訊：`digraph-ph/sentence-1`。

先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。

- `support-1-1`：**the phone**；這個／那個；冠詞通常弱讀。
- `support-1-2`：**is on the desk**；是／在；s在此讀/z/，先聽片語。
### Say the phrase.

說出這個片語。

重點詞：phrase；整句音訊：`digraph-ph/sentence-2`。

先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。

- `support-2-1`：**the phrase**；這個／那個；冠詞通常弱讀。

## 音訊需求與共用字庫

整批實際結果見[製作與驗收](../phonics-345/review.md)、[音訊盤點](../phonics-345/audio-inventory.md)、[技術驗證](../phonics-345/audio-verification.json)及[字庫回補](../phonics-345/wordbank-review.md)。下表保留初始備料快照，最新音訊狀態以整批文件為準。

每項去重需求只算一次，示範、題目與點詞重用整詞音。以下是內容備料時的清單；未盤點不等於確認缺音。實際重用／補缺與檔案驗證以整批紀錄為準，不在前台開頁時生成。

| Key | 類型 | 完整文字 | 備料狀態／人工聽審 |
| --- | --- | --- | --- |
| phone | 整詞 | phone | 未盤點／未聽審 |
| graph | 整詞 | graph | 未盤點／未聽審 |
| phase | 整詞 | phase | 未盤點／未聽審 |
| phrase | 整詞 | phrase | 未盤點／未聽審 |
| sentence-1 | 整句 | The phone is on the desk. | 未盤點／未聽審 |
| support-1-1 | 支援片語 | the phone | 未盤點／未聽審 |
| support-1-2 | 支援片語 | is on the desk | 未盤點／未聽審 |
| sentence-2 | 整句 | Say the phrase. | 未盤點／未聽審 |
| support-2-1 | 支援片語 | the phrase | 未盤點／未聽審 |

本課共9項去重播放需求。音訊來源、原設定、文字hash、檔案hash、時長、實體檔驗證與人工發音聽審分開保存；沒有孤立音素／逐音拼合音訊。

## 待驗項目

- 前台與全批接入驗證見本課review及整批紀錄；本文件不單獨宣稱已部署。
- 人工試聽逐詞目標音、字首字尾及句子自然度，尚未完成。
- 桌機／手機需確認最長單詞、VC等實際結構、字形塊、多字母高亮、換組停止與播放失敗提示。
