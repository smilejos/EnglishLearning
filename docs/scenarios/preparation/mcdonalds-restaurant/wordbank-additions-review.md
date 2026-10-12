# 麥當勞批次字庫增量審閱

日期：2026-10-12。狀態：**37 新詞、2 筆 Others 分類與 Tray 釋義修正已正式寫入且同步 canonical source；待新增 0，四場 revision 1 皆為 draft，未發布**。

## 範圍與配置

- 本增量只含原清單 33 缺詞＋第一場 4 模式，共 37 詞條。每詞 3 英文解釋、3 中英例句；合計 111 解釋、111 例句，259 個不重複 GUID（37 主項＋222 子項）。文案為離線撰寫，未呼叫真實 LLM、TTS 或圖片服務。
- 保留使用者指定拼字與繁中意思；31 多字詞／連字號詞分類為 Others，6 單字採現有適合分類。Others 不代表詞性或級別。
- Combo Meal／Takeout 為 n；Dine-in 為 adj（內用服務模式）；À la carte 同時記錄 adj／adv，情境目標採 adj。新詞 cefr、tw_7000、list 全部 null。
- 匯入前來源最高 id 為 9175；本次依原清單順序配置 9176–9212，正式 preflight 查 source id／word／主子 GUID 無碰撞，37 新詞已正式入庫，穩定配置未變。現在 canonical source 為 9,203 詞、最高 id 9212。
- UUIDv5 命名空間 `9af51974-3a37-55bd-b677-5634feac0eb5`。一旦配置，後續使用同一檔中的主子 GUID 與 id，不因文字修訂重配；只讀取原檔即可重用。寫入前來源 SHA256：`7df89d8abab18348a0acbfe5720c108a7a2b54057e6aee22f9d488dc37b446ea`。
- 正式來源與 DB 均已同步；寫入前 source 備份為 `data/scenario-preparation/mcdonalds-restaurant/canonical-source-before-draft-import.json`，原 9,166 詞，加入 37 詞後 9,203 詞。`canonical-source-change.json` 保留同步來源時尚未正式 DB 寫入的歷史欄位，後續寫入以 `wordbank-import.log` 及各場正式 postcheck 為準。

## 逐詞增量

| 場次 | 英文 | 詞性 | 繁中釋義 | 分類 | 正式 source id | 正式 GUID |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Menu Board | n | 菜單看板 | Others | 9176 | d964f7b7-2224-5fce-965f-3375ed903d80 |
| 1 | Self-Service Kiosk | n | 自助點餐機 | Others | 9177 | 122000c0-ab05-5c69-906a-a505f62c6ee2 |
| 1 | Cash Register | n | 收銀機 | Others | 9178 | a263ce51-35b4-5dde-a56c-240c9f6f3668 |
| 1 | Dining Area | n | 用餐區 | Others | 9179 | 259a4ecb-6973-5e40-b1ca-83dd51ac85d0 |
| 2 | Cheeseburger | n | 起司漢堡 | Food & drinks | 9180 | 9460f908-8416-5250-bb62-6b31972bce2e |
| 2 | Big Mac | n | 大麥克 | Others | 9181 | 7be495ca-e5db-5aed-bd99-30bf6397ce9e |
| 2 | Chicken Burger | n | 雞肉漢堡 | Others | 9182 | 12fe2281-38e1-52c3-946c-79bf8a607c02 |
| 2 | Fish Burger | n | 魚肉漢堡 | Others | 9183 | 8731add9-6029-54a4-8c91-6b747f93f667 |
| 2 | Chicken Nuggets | n | 雞塊 | Others | 9184 | 833a9ad9-2097-5139-b738-547ca41e8463 |
| 2 | Hash Brown | n | 薯餅 | Others | 9185 | 49988d44-96ab-5742-9d57-7c2dca7f20e4 |
| 2 | Apple Pie | n | 蘋果派 | Others | 9186 | 8fcc03a8-194e-5550-aab8-397b4aa62f1a |
| 2 | Ice Cream Cone | n | 蛋捲冰淇淋 | Others | 9187 | 8c9fbb43-a84e-5d99-b9c1-5dc6a872c7da |
| 2 | Sundae | n | 聖代 | Food & drinks | 9188 | 7b87f992-6dd3-5d41-b681-fe74d07eb5d2 |
| 2 | Soft Drink | n | 汽水 | Others | 9189 | 4b71f758-9c4d-5178-b1ce-671077e674fe |
| 2 | Orange Juice | n | 柳橙汁 | Others | 9190 | 6567ccd3-2a17-54c8-a90d-b9701574e406 |
| 2 | Happy Meal | n | 快樂兒童餐 | Others | 9191 | b095635a-83d8-5948-9056-e721dc38e986 |
| 3 | Wrapper | n | 食物包裝紙 | Tableware | 9192 | d825e045-35cd-5522-b0b5-f01f3a2e123f |
| 3 | Paper Bag | n | 紙袋 | Others | 9193 | 7fdb901f-c4e0-59a3-a478-c0d96c820e4c |
| 3 | Food Box | n | 餐盒 | Others | 9194 | 0fa66e06-5227-5fe1-9f68-b948e4d82ec9 |
| 3 | Dipping Sauce | n | 沾醬 | Others | 9195 | 423d3976-08f2-530b-a9a5-d8b58737da01 |
| 3 | Burger Bun | n | 漢堡麵包 | Others | 9196 | e1e82622-3f02-52b7-b301-d53257eb31c7 |
| 4 | Recycling Bin | n | 資源回收桶 | Others | 9197 | 7d0e9d9e-ea2f-5e56-afa6-94e6d0225f7c |
| 4 | Tray Return Station | n | 餐盤回收區 | Others | 9198 | d4590780-19b5-53d9-b2e7-1e7a77d1780e |
| 4 | Leftovers | n | 剩餘食物 | Food & drinks | 9199 | 7cdc3862-829a-55f2-be8f-1fb61b502066 |
| 4 | Empty Cup | n | 空杯子 | Others | 9200 | 4fdd11c6-9ad0-5965-89dc-21ea145c3d77 |
| 4 | Paper Wrapper | n | 食物包裝紙 | Others | 9201 | f6753daf-52d7-5de0-8f6d-cab8bd41e36f |
| 4 | Used Napkin | n | 使用過的餐巾紙 | Others | 9202 | d5383ce1-423f-59e0-8221-15b961798f5f |
| 4 | Cleaning Cloth | n | 清潔抹布 | Others | 9203 | 60b02d58-5775-575e-88dc-0371ae7e3ff4 |
| 4 | Dustpan | n | 畚箕 | Houses & apartments | 9204 | ed2cfd8e-3409-5da3-8167-1a319b974e16 |
| 4 | Cleaning Cart | n | 清潔推車 | Others | 9205 | 922f4be5-bc43-55e7-89c3-312a9acb4592 |
| 4 | Trash Bag | n | 垃圾袋 | Others | 9206 | ac43a461-fde3-557c-8708-c5ae15d0ad8a |
| 4 | Recycling Symbol | n | 回收標誌 | Others | 9207 | 1eb54d53-4622-590a-851b-d73a9dec8082 |
| 4 | Exit Sign | n | 出口指示牌 | Others | 9208 | 4d100eb8-e0a3-5995-b672-9d7c56620a1b |
| 1 | Combo Meal | n | 套餐 | Others | 9209 | 18e6fa71-d307-55d9-ac9f-d37d2033f3e9 |
| 1 | À la carte | adj / adv | 單點（的） | Others | 9210 | f9a73ba5-eec3-50c8-940a-2bb64b0bbf94 |
| 1 | Dine-in | adj | 內用（的） | Others | 9211 | 1f6fd002-1468-54c1-a271-9fba091fca99 |
| 1 | Takeout | n | 外帶（餐點） | Food & drinks | 9212 | 799a7de6-37fa-5a6a-a3fa-b731c99d80c1 |

## 既有詞修正與重用

- Tray 重用 `da59f650-66c8-5d96-a95d-81722978e727`。來源繁中釋義「實木排水茶盤；茶席托盤」過窄，教材要「托盤」；中文修正紀錄另存 [wordbank-definition-repair.json](wordbank-definition-repair.json)：一般托盤／餐盤義並保留茶盤義，並核對原英文解釋／例句。**此修正由獨立更正流程完成，正式 DB 與來源已同步**；仍保留原 GUID，沒有用新增假 GUID 或一般補缺 importer 覆寫非空定義。
- French Fries／Trash Can 保留既有 GUID。依使用者多字詞分類要求，已在兩個既有詞上合併 Others；37 新詞增量本身不含此變更，分類增量另存 [wordbank-category-updates.json](wordbank-category-updates.json)，2 詞官方 dry-run 通過並已正式套用，不重建同字詞。
- Wrapper／Paper Wrapper 都指食物包裝材料，後者明確限定紙材；圖中以使用前後狀態區分，本義保持一致。

## 品質與尚待核對

- Chicken Burger／Fish Burger／Chicken Nuggets 保留使用者名稱，不替換成其他品牌商品名。餐點詞條描述通用物件，不宣稱特定分店同時提供所有品項。
- Big Mac 解釋採典型大麥克的雙層肉排、中層麵包與配料；未作本次即時菜單／過敏原資訊查證。Happy Meal 用 may 表達附贈品，不保證特定玩具。
- Soft Drink 保留「汽水」指定義；解釋說明一般 soft drink 範圍較廣，本教材採有氣泡飲料義。
- 圖示與例句不承諾回收規則；Recycling Bin 以現場接受項目與標示為準，Recycling Symbol 也不保證每種物品皆可回收。
- 畚箕採使用者繁中用字；Leftovers 保留複數；À la carte 保留重音與原拼字；目前共享 span 驗證器已支援完整片語／重音與屈折映射，程式全測通過且 api／web-learner 已健康更新，正式 À la carte 完整片語詞卡已驗證。
- 圖像與離線映射已逐場驗收、音檔逐場生成並完整解碼；發音仍待人工完整聽音，104 張正式詞卡逐一載入、四場桌機回想與旁白抽查、390px 手機操作已核對；全面品質／角色驗收仍待完成。37 新詞已正式入庫，未發布。

## 故事備料

`generation-texts.json` 從 review.md 的四段故事區逐句提取，15／12／11／15 句，共 53 句，英文及繁中全文由句子依原序接合；句 id 原按句序配置為 s1…sN；Scene 4 為分別涵蓋 Empty Cup 與 empty，另在原 s4 後加入 s4-empty，保留其他既有句 id。保留目標詞與原故事主旨；為讓支援詞對應真實既有 GUID，單點句改 each item、雞塊句改完整 chicken nuggets、飲料收集口改 special hole，垃圾袋句移除來源綁結義未完備的 tied。新增獨立 empty 句以避免與 Empty Cup 片語重疊。第四場依實圖改空杯在托盤、母親在餐盤回收區架子歸還托盤，以及同張擦拭桌面遠端已乾淨，所有原目標詞保留。該檔沒有 wordLinks、座標、media metadata 或正式 GUID 存在證據，**不是 scenario.json，不能匯入或視為可發布套件**。

## 離線驗證

- 匯入前自訂資料盤點：37 主詞 id 無撞來源；259 主子 GUID 全部唯一且無撞來源；37 拼字無來源完整詞重複；37 指定詞無缺漏；每詞 3 解釋＋3 中英例句；分級皆 null；多字詞皆 Others；通過。
- 官方 CLI：`npm run vocabulary:import -- docs/scenarios/preparation/mcdonalds-restaurant/wordbank-additions.json --dry-run`，**通過，exit code 0**。輸出：「字庫檢查：37 字，basic 0 字；缺中文定義 0 字，缺英文解釋 0 字。」「僅檢查檔案，未連線或寫入資料庫。」
- 正式 target 唯讀核對／37 新詞 GUID、id、word 查重已完成且零碰撞；離線套件／靜態座標與本機語音已逐場製作。後續 canonical source 同步與正式寫入已完成，正式 UI 已核對上述指定範圍，全面品質驗收尚待。

## 本批正式匯入收尾

四張底圖與四個故事 MP3 已正式匯入；423 段新目標詞音已複製 volume／匯入 metadata，335 段有效舊音重用。全部新音完整解碼，人工完整試聽待做。67 既有目標與 37 新詞均已可讀，2 筆 Others 分類及 Tray 釋義同步正式 DB／canonical source。

使用者本輪「請繼續」授權必要字庫、draft 與服務更新；四場 r1 draft 匯入及單場 check／copy-audio／audio-metadata／scenario／postcheck 全過，餐廳標籤 24。正式庫識別與必要 204 GUID 基準見 `data/scenario-preparation/mcdonalds-restaurant/production-preflight.json`；單場結果見各 `import-<scenarioKey>/` 五份 log。全批跨資料保留查核另行紀錄。

備份 `data/scenario-import-backups/mcdonalds-restaurant-20261012/20261012-011810/verification.json` 記錄 DB／audio／images 全解析與 hash 通過，未做隔離還原。652 項測試與 typecheck 全過；正式 Chrome 結果見 `data/scenario-preparation/mcdonalds-restaurant/browser-qa.json`。尚未完整人工聆聽與全面品質／角色驗收，不宣稱品質可發布，也未授權或執行發布。

## 全局匯入後核對

2026-10-12 全局唯讀 postcheck 通過：四場 revision 1 維持 draft／發布指標 null，204 個相關 GUID 與 canonical 一致，758 段目標詞音 metadata／文字 hash／bytes／檔案 hash 有效；四份 API detail 與八個 HTTP 媒體的 hash 通過。所有既有 revision hash、發布指標及 17 個 migration 紀錄與匯入前基準相同；一般情境清單隱藏 draft。證據：`data/scenario-preparation/mcdonalds-restaurant/production-postcheck.json`。此結果不代表人工完整試聽、learner 角色端到端或品質可發布。
