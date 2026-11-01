# 五短母音共用字庫備料

2026-11-01。本文件記錄可審閱的離線增量，**未正式匯入**。正式 DB 的唯讀基準為 `english_learning`、使用者 `app`，9,203 詞，最大 source id 9212；基準見 [wordbank-before.json](wordbank-before.json)。本次未執行 migration、正式 INSERT／UPDATE／DELETE、seed 或服務檔案寫入。

## 新詞與屈折形

56 個課程詞中，51 詞沿用既有詞條與 GUID，5 詞在 canonical 與當次正式 DB 基準皆不存在。本批為這五詞建立獨立詞條，避免將不同拼寫錄音掛到原形。

| source id | 詞 | 本課用法／原形關係 | 新詞條 GUID |
| --- | --- | --- | --- |
| 9213 | sat | sit 的過去式與過去分詞；坐／坐下 | `069db3d4-41ea-5df6-944b-e3a6609e7894` |
| 9214 | ran | run 的過去式；跑；過去分詞仍為 run | `36fd6fc8-36ca-5c99-977e-c941b15e5568` |
| 9215 | men | man 的不規則複數；成年男性 | `0e1c1d75-59f2-5cf5-b087-622165460e8b` |
| 9216 | fed | feed 的過去式與過去分詞；餵食 | `1b9f1a6e-95b7-5262-a6a9-1edc2509be59` |
| 9217 | cot | 本課美式用法：簡易床／帆布折疊床；不以英式嬰兒床詞義配圖 | `044321f5-089b-53c3-a42a-1b90889352bb` |

各新詞有詞性、繁中釋義、3 段英文解釋、3 組自然中英例句。屈折關係寫在定義與解釋，沒有新增資料庫欄位。沒有另查可靠分級依據，`cefr／tw_7000／list` 均留 null；不為進入 basic 篩選偽造級別。既有第二功能的分級篩選仍適用，未分級不代表會自動出現在某個既有級別。

新 GUID 使用 canonical 已記錄的 UUID v5 命名空間 `5aa9fb1e-a703-519e-83a1-290af6e0b8e4`，加入 `phonics:short-vowels:` 前綴、素材種類與文字內容建立穩定值。已核對 source id 與來源內所有舊詞條／例句／解釋 GUID 不重複；正式 DB 的 entry／example／explain／audio 全域查核確認 43 個新 GUID（5 詞條、15 解釋、23 例句）皆未佔用，source id 9213–9217 亦未佔用；證據見 [wordbank-guid-preflight.json](wordbank-guid-preflight.json)。

## 短句作為真實例句

新增四課的 8 句各補入一個合適的既有目標詞；保留該詞全部舊解釋、例句、分級及其他欄位。原短 a 的兩句納入新詞 sat 的三例句之中，不另重複增加。每句的子 GUID、entry GUID、完整文字與 textHash 記於 [wordbank-phonics-mapping.json](wordbank-phonics-mapping.json)。

| 課程／音訊 key | 英文例句 | 歸屬詞 |
| --- | --- | --- |
| short-a／sentence-1 | A cat sat. | sat（新詞的例句） |
| short-a／sentence-family-2 | A man sat on a mat. | sat（新詞的例句） |
| short-e／sentence-1 | Get a red pen. | pen |
| short-e／sentence-2 | The hen is on the bed. | hen |
| short-i／sentence-1 | The pig is big. | pig |
| short-i／sentence-2 | The pig can sit. | sit |
| short-o／sentence-1 | The pot is hot. | pot |
| short-o／sentence-2 | Hop to the top. | hop |
| short-u／sentence-1 | Run in the sun. | run |
| short-u／sentence-2 | The bug is on the rug. | bug |

19 段支援片語維持教材資產，不建立重複單字詞條、不塞入整詞音欄。整詞資產 GUID 等於詞條 GUID；整句音可歸屬上述例句子 GUID。這份映射不代表音檔已轉存或 metadata 已匯入。

## 增量與驗證

- [wordbank-additions.json](wordbank-additions.json)：13 筆受影響詞條，含 5 個完整新詞與 8 筆既有詞的例句增量；合計新增 15 解釋、23 例句。既有詞增量只攜帶 `id／guid／word／examples`，匯入契約會保留原內容。
- `source/vocabulary-database.json`：已同步離線內容，共 9,208 詞、27,663 段英文解釋、33,000 組例句。這些是本次備料後的來源數，不是正式 DB 當前數。
- `npm run vocabulary:import -- docs/phonics/preparation/short-vowels/wordbank-additions.json --dry-run` 通過，未連 DB。輸出中的 8 筆缺定義／解釋是局部增量沒有重送舊內容，並非 canonical 的缺漏。
- `npm run vocabulary:import -- source/vocabulary-database.json --dry-run` 通過：9,208 詞、缺中文定義 0、缺英文解釋 0。
- 使用正式 `parseWordbankDocument／mergeWordbankEntry` 契約，將增量套到修改前 canonical，與修改後 canonical 逐筆比對完全相等；8 個既有詞只追加指定例句，其餘 9,195 個既有詞不變；source id 無重複。
- 56 個整詞與 10 個整句的 GUID／文字映射已對 canonical read-back 核對。檔案驗證、人工聽審、服務音檔落地、音 metadata 匯入與第二功能實際播放，須分別依本批音訊與正式操作紀錄認定。

正式匯入前仍須取得本批具體操作授權、確認實際目標與備份；只匯增量，不將整份 canonical 當成本次匯入範圍。尚未入庫不能標示「已回補共用字庫」。
