# 子音字形 th：無聲教材（digraph-th-voiceless）

2026-11-02，自編第一版；參照照片的教學範圍，依目前平台的先備與四階段重編，未抄用手寫答案。

## 課程設定

- 順序：五長短母音 → 第3章子音連綴 → sh → ch → 無聲th → 有聲th → wh → ph → tch／ch比較。
- 目標聲音：/θ/，採美式示範；拼法：th。
- 學習目標：舌尖靠近上齒，讓氣流通過，認識無聲th。
- 教材來源：`screenshots/IMG_3294.HEIC`（p136）、`IMG_3295.HEIC`（p137）、`IMG_3296.HEIC`（頁碼未入鏡）；範圍參照原書，詞表、題目及短句為本批自編。
- 數量：5個實際韻尾字族，7個去重目標詞；3示範、8題（4聽音選字／4聽音拼字）、2短句。
- 製作範圍：前台教材接入的內容備料；實際接入、音訊生成、正式字庫回補、部署與人工品質驗收分開記錄。
- 共用字庫：逐詞GUID見下表，沿用既有詞條；本文件不代表已寫入正式庫。
- 先備：已學五長短母音、基本單字母子音及第3章雙子音連綴。
- 先備：同一字形可含多個字母；拼字作答塊與音素數量分開看。
- 先備：先學sh、ch；bath/path採美式/æ/；cloth採美式/ɑ/，沿用短O。
- 份量理由：只收先備可承接的常用詞，不為配額加入未教母音、多音節或不穩定口音變體。

## 一、認識聲音

聽 thin、bath、moth 的完整單字，留意 /θ/；先看本課目標字形，再完整逐音拼合。

th在本課讀/θ/，喉部不振動；與/s/、/t/分開。七詞依常用度與先備選取，不加入oo或未教多音節湊數。

播放完整單字，留意其中的目標聲音。沒有合格孤立音素錄音，不把音素文字或TTS字母名稱當成逐音音訊。

| 示範詞 | 詞義 | 目標位置（0起算、終點不含） | 播放 |
| --- | --- | --- | --- |
| thin | 薄的；瘦的 | [0,2) | `digraph-th-voiceless/thin`，完整單字 |
| bath | 澡；浴缸 | [2,4) | `digraph-th-voiceless/bath`，完整單字 |
| moth | 蛾 | [2,4) | `digraph-th-voiceless/moth`，完整單字 |

## 二、看字拼讀

先選第一字族第一詞，不自動播放。先同族變換字首，再比較不同韻尾；基本單子音在前，已教連綴在後。單詞仍逐音拼合，不能只記字族猜字。

多字母子音字形表示一個C；既有a_e／i_e／o_e以不連續範圍表示，原單字維持正常字序。拼字塊保留實際連續字母順序，不能以字母數代替作答塊數。

### 1. th → -in（1詞）

識別：`digraph-th-voiceless-th-1`；共同韻尾：/ɪn/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. thin | 薄的；瘦的 | /θ / ɪ / n/ | CVC | th [0,2)／i [2,3)／n [3,4) | [0,2) | th／i／n | a1777815-c12b-59a8-8c2d-2069d1826872 |

### 2. th → -ath（3詞）

識別：`digraph-th-voiceless-th-2`；共同韻尾：/æθ/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. bath | 澡；浴缸 | /b / æ / θ/ | CVC | b [0,1)／a [1,2)／th [2,4) | [2,4) | b／a／th | 17e48c9a-335d-56a1-ae1a-658608a5d1ea |
| 2. math | 數學 | /m / æ / θ/ | CVC | m [0,1)／a [1,2)／th [2,4) | [2,4) | m／a／th | ddc0aadb-f148-5055-8910-ad6b17d60787 |
| 3. path | 小路 | /p / æ / θ/ | CVC | p [0,1)／a [1,2)／th [2,4) | [2,4) | p／a／th | 11e5ee52-9dcf-5f3b-ab07-e12331a9b246 |

### 3. th → -oth（1詞）

識別：`digraph-th-voiceless-th-3`；共同韻尾：/ɑθ/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. moth | 蛾 | /m / ɑ / θ/ | CVC | m [0,1)／o [1,2)／th [2,4) | [2,4) | m／o／th | 1b887928-edf1-571b-a61e-0280d3f6611c |

### 4. th → -oth（1詞）

識別：`digraph-th-voiceless-th-4`；共同韻尾：/ɑθ/。cloth採美式/klɑθ/，沿用短O；部分口音讀/klɔθ/，不混在本課同題中比較。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. cloth | 布 | /k / l / ɑ / θ/ | CCVC | c [0,1)／l [1,2)／o [2,3)／th [3,5) | [3,5) | c／l／o／th | 79733d46-e4b3-5c27-aa1e-83dba96cb7a9 |

### 5. th → -eft（1詞）

識別：`digraph-th-voiceless-th-5`；共同韻尾：/ɛft/。先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。

| 順序／單字 | 本課詞義 | 完整音素 | 結構 | 字形分組與位置 | 目標位置 | 作答塊 | 共用字庫GUID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. theft | 偷竊 | /θ / ɛ / f / t/ | CVCC | th [0,2)／e [2,3)／f [3,4)／t [4,5) | [0,2) | th／e／f／t | c2da7a6f-50a5-5ed8-963a-73f9ff3e856f |

各字族按實際詞數播放；650ms字間隔、0.8倍速、個別改播與停止沿用現有介面。切換拼法／字族／結構即取消舊音訊與佇列，重設新詞表第一詞且不自動播放；空詞表停用播放。

## 三、動手練習

答案與選字干擾詞都在本課第二階段明示；沒有未教遷移詞。干擾以字首／字尾／母音差異比較，不將同音異字放在同一聽選題。

| 題目ID | 題型 | 播放與正解 | 選項／作答塊 | 來源拼法／字族／結構 |
| --- | --- | --- | --- | --- |
| digraph-th-voiceless-1-listen | 聽音選字 | `digraph-th-voiceless/thin` → thin | thin／bath／path | th／-in／CVC |
| digraph-th-voiceless-2-spell | 聽音拼字 | `digraph-th-voiceless/math` → math | th／a／m／p | th／-ath／CVC |
| digraph-th-voiceless-3-listen | 聽音選字 | `digraph-th-voiceless/bath` → bath | math／bath／moth | th／-ath／CVC |
| digraph-th-voiceless-4-spell | 聽音拼字 | `digraph-th-voiceless/path` → path | th／a／p／n | th／-ath／CVC |
| digraph-th-voiceless-5-listen | 聽音選字 | `digraph-th-voiceless/moth` → moth | moth／cloth／math | th／-oth／CVC |
| digraph-th-voiceless-6-spell | 聽音拼字 | `digraph-th-voiceless/theft` → theft | t／f／e／th／p | th／-eft／CVCC |
| digraph-th-voiceless-7-listen | 聽音選字 | `digraph-th-voiceless/theft` → theft | thin／theft／cloth | th／-eft／CVCC |
| digraph-th-voiceless-8-spell | 聽音拼字 | `digraph-th-voiceless/thin` → thin | n／i／th／p | th／-in／CVC |

確認前可改選／清除；確認後呈現正解、上表詞義及重聽提示。第一次作答統計本輪結果，可只練錯題或重練全部，離開練習重設，不保存跨次成績。沒有麥克風、自動評分或收藏。

## 四、讀個短句

### A thin cat is on the path.

一隻瘦貓在小路上。

重點詞：thin、path；整句音訊：`digraph-th-voiceless/sentence-1`。

先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。

- `support-1-1`：**a thin cat**；一個／一隻；冠詞通常弱讀。
- `support-1-2`：**is on the path**；是／在；s在此讀/z/，先聽片語。
- `support-1-3`：**the path**；這個／那個；冠詞通常弱讀。
### A moth is on the cloth.

一隻蛾在布上。

重點詞：moth、cloth；整句音訊：`digraph-th-voiceless/sentence-2`。

先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。

- `support-2-1`：**a moth**；一個／一隻；冠詞通常弱讀。
- `support-2-2`：**is on the cloth**；是／在；s在此讀/z/，先聽片語。
- `support-2-3`：**the cloth**；這個／那個；冠詞通常弱讀。

## 音訊需求與共用字庫

整批實際結果見[製作與驗收](../phonics-345/review.md)、[音訊盤點](../phonics-345/audio-inventory.md)、[技術驗證](../phonics-345/audio-verification.json)及[字庫回補](../phonics-345/wordbank-review.md)。下表保留初始備料快照，最新音訊狀態以整批文件為準。

每項去重需求只算一次，示範、題目與點詞重用整詞音。以下是內容備料時的清單；未盤點不等於確認缺音。實際重用／補缺與檔案驗證以整批紀錄為準，不在前台開頁時生成。

| Key | 類型 | 完整文字 | 備料狀態／人工聽審 |
| --- | --- | --- | --- |
| thin | 整詞 | thin | 未盤點／未聽審 |
| bath | 整詞 | bath | 未盤點／未聽審 |
| math | 整詞 | math | 未盤點／未聽審 |
| path | 整詞 | path | 未盤點／未聽審 |
| moth | 整詞 | moth | 未盤點／未聽審 |
| cloth | 整詞 | cloth | 未盤點／未聽審 |
| theft | 整詞 | theft | 未盤點／未聽審 |
| sentence-1 | 整句 | A thin cat is on the path. | 未盤點／未聽審 |
| support-1-1 | 支援片語 | a thin cat | 未盤點／未聽審 |
| support-1-2 | 支援片語 | is on the path | 未盤點／未聽審 |
| support-1-3 | 支援片語 | the path | 未盤點／未聽審 |
| sentence-2 | 整句 | A moth is on the cloth. | 未盤點／未聽審 |
| support-2-1 | 支援片語 | a moth | 未盤點／未聽審 |
| support-2-2 | 支援片語 | is on the cloth | 未盤點／未聽審 |
| support-2-3 | 支援片語 | the cloth | 未盤點／未聽審 |

本課共15項去重播放需求。音訊來源、原設定、文字hash、檔案hash、時長、實體檔驗證與人工發音聽審分開保存；沒有孤立音素／逐音拼合音訊。

## 待驗項目

- 前台與全批接入驗證見本課review及整批紀錄；本文件不單獨宣稱已部署。
- 人工試聽逐詞目標音、字首字尾及句子自然度，尚未完成。
- 桌機／手機需確認最長單詞、VC等實際結構、字形塊、多字母高亮、換組停止與播放失敗提示。
