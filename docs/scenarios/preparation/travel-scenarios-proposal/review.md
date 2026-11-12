# 旅遊情境四場提案與底圖

> 2026-11-12 匯入備料更新：目前狀態以[匯入準備總表](import-preparation-review.md)為準。下文保留較早圖片製作／選詞階段紀錄，當時的缺GUID／缺座標／未check等敘述不代表目前備料進度。

原四場底圖已保存；本輪依使用者「那幫我補圖吧」實際編修機場圖為v2，窗外已新增載行李拖車與前方牽引車，原v1保留。本批沒有產音、補詞入庫、查核或寫入正式DB、匯入、發布或部署。

原機場21詞及渡輪主候選依離線canonical字庫basic＋advance選取；本輪機場依指定設施詞改採user-specified，新增詞保留真實expert／null；飯店依使用者指定的「櫃檯人員、寄放行李、旁邊茶水、衛浴用品」提出指定詞候選，不因 expert／未分級排除。新增機艙依使用者指定概念選詞；已有GUID只表示離線來源存在，不代表已核對正式庫。機艙的business class／economy class尚缺，GUID保留null。下表預定線索保留供對照；四場均已新增實際看圖紀錄於batch.json的imageEvidence及各圖片README，未把語境詞宣稱為單憑外觀可辨識。

飯店本輪重點為四區：中央入住櫃檯、側邊寄放行李、旁邊茶水桌、靠櫃檯的可索取備品架。備品整齊擺放於托盤或架上。詞表以人事物優先，不硬湊預設詞性配額。

## 1. 機場登機

底圖已實際編修為v2：[新版圖片](../../../../output/imagegen/travel-airport-gate-base-2026-11-11-v2/base.png)／[編修提示詞](../../../../output/imagegen/travel-airport-gate-base-2026-11-11-v2/prompt.txt)／[逐詞看圖紀錄](../../../../output/imagegen/travel-airport-gate-base-2026-11-11-v2/README.md)。[原v1](../../../../output/imagegen/travel-airport-gate-base-2026-11-11-v1/base.png)保留且SHA不變。

在登機門排隊、核對票券並準備登機；不混入安檢或機艙用餐。

主候選26詞＝17名詞＋4形容詞＋5動詞，採user-specified；25詞已有canonical GUID，baggage cart仍是必要缺詞，GUID=null。行李拖車的圖像缺件已補齊，尚未補字庫或匯入教材。素材v2不是正式教材revision 2，預定首個教材revision仍為1。

| 單字 | 詞性 | 本場詞義 | 原級別 | GUID／狀態 | v2可見線索 |
| --- | --- | --- | --- | --- | --- |
| airport | n | 機場 | basic | 6598df4f-74d0-5f12-8de7-6043b46336ca | 落地玻璃窗、停機坪、登機櫃檯與空橋共同呈現機場候機區。 |
| airplane | n | 飛機 | basic | 55eefd94-534b-5a8b-97ed-6eef05dec561 | 窗外的大型客機，可見機身、機尾、機翼與引擎；機首一部分被空橋遮住但仍可辨識。 |
| gate | n | 登機門 | basic | 89921bea-fb3a-5795-923d-7137dcac7c16 | 右側連入空橋的開放登機入口。 |
| ticket | n | 票券 | basic | 1a126970-ab39-5697-bab2-7316a7819184 | 男孩右手向地勤出示的白色紙本旅行票證；圖面沒有文字，不單憑外觀辨別票券用途。 |
| passenger | n | 乘客 | advance | fed03f94-0206-56c3-8136-5cbb4dc374a4 | 排隊旅客、男孩與走入空橋的成人。 |
| bag | n | 旅行袋 | basic | be63fd22-30f2-55f4-88d1-5633149ddd18 | 中央男士雙手提起的鼓脹深藍旅行袋。 |
| window | n | 窗戶 | basic | 895fce7b-e5c4-51d8-8fa6-f8caa1f97b38 | 畫面後方可看見客機的大面玻璃窗。 |
| seat | n | 座位 | basic | accb9ef6-d6e7-52b8-a363-0ab9db325e1a | 左前方無人乘坐的藍色候機椅。 |
| line | n | 隊伍 | basic | 2ef3ae04-1fc7-5dd1-9642-4eb7dc49c4a2 | 男孩、提袋男士與女士依序排在藍色欄帶旁。 |
| screen | n | 螢幕 | basic | 8ed10464-d75f-5b84-853d-c464b6d069c7 | 左上方顯示飛機圖示與色塊的壁掛螢幕。 |
| clock | n | 時鐘 | basic | ca66ba9a-d268-5346-a6dc-4f413011557d | 螢幕正上方的無數字指針鐘。 |
| uniform | n | 制服 | basic | a9faa595-0c09-57f5-b092-c3d84f41a563 | 地勤身上的深藍制服與黃色領巾。 |
| busy | adj | 繁忙的 | basic | 9d321e96-b853-5882-97ed-5043682012a3 | 查票、排隊與走入空橋同時進行，繁忙感屬場景語境。 |
| heavy | adj | 重的 | basic | 6b8d21a1-e26b-56f1-9fd2-6713b1a97a13 | 男士雙手提起大旅行袋；實際重量不能由圖證明，需故事補足。 |
| empty | adj | 空的 | advance | 4f4d22bb-206c-5956-92dc-bc173b400fe5 | 左前候機椅上沒有乘客。 |
| ready | adj | 準備好的 | basic | 942c6872-e7d6-5c79-9e8e-da4c736905b2 | 男孩票證已備妥、另一旅客正進入空橋；準備就緒需語境。 |
| wait | v | 等候 | basic | dec06abd-726b-5825-93e6-8f495225bc26 | 男士與女士在男孩後方排隊等候。 |
| carry | v | 提著；攜帶 | basic | 0f8320ac-886d-53fc-bfe0-82d2334def76 | 男士以雙手提起旅行袋，袋子離地。 |
| check | v | 檢查；核對 | basic | 7242d255-af15-510d-8c98-44f37f9b9ee0 | 地勤將手持讀取器對向男孩出示的票證。 |
| show | v | 出示 | basic | 667d6728-5915-53f4-a67c-5e01f1d9ff58 | 男孩把白色紙本票證伸向地勤。 |
| board | v | 登機 | advance | f813645b-5fc5-5c97-b02a-684b14dd9f63 | 右側背包旅客背向候機區走入登機空橋，登機方向清楚。 |
| airbridge | n | 空橋；登機空橋 | 未分級 | 6d18d5d4-5288-5c3e-8cf0-f854d81f146d | 右側旅客走入的封閉玻璃空橋，窗外也可看見連接客機的伸縮結構。 |
| baggage cart | n | 行李運輸拖車 | 未分級 | 必要缺詞，GUID=null | 中央窗外、客機引擎前下方可見低矮四輪載運拖車，上有紅／黃／紫三只行李箱，前方由白藍牽引車拖動；與右側空橋支撐底盤分開。 |
| passage | n | 通道 | expert | d876dd09-9a4c-5c78-8e91-92d7b9e7931b | 右側空橋內可行走的地板與兩側扶欄形成的通道；標籤指內部行走空間，與airbridge整體設施區分。 |
| terminal | n | 航廈 | expert | 5ab06837-66dd-5f0f-89fa-978a1b7cfbea | 整體候機區、大片窗戶與登機入口呈現航廈內部；精確場所名稱需故事語境。 |
| suitcase | n | 行李箱 | expert | 25804565-39d9-579e-a864-5fbf2c16ac0d | 男孩身前的藍紫色拉桿行李箱，與男士提著的bag旅行袋分開指向。 |

原21詞之外新增airbridge、baggage cart、passage、terminal與suitcase；空橋沿用airbridge既有GUID，jet bridge為別稱。passage指空橋內行走空間，與整體設施區分。suitcase從延伸移入主詞表，不重複計算。

v2窗外中央可辨識一台低矮拖車、紅黃紫三只行李箱及前方白藍牽引車。baggage cart指載行李拖車，baggage tractor為前方動力車頭，右側空橋支撐底盤另保留。後兩者不冒稱相同詞義，也沒有擅自增加主詞總數。

延伸候選（未列入主詞）：

| 單字 | 詞義 | 原級別 | GUID |
| --- | --- | --- | --- |
| passport | 護照 | expert | 8315fb35-d242-58af-8aaa-638a878ad478 |
| boarding pass | 登機證 | 未分級 | 151fd2cc-f8a3-5693-84e3-b474dc12c9ea |
| luggage | 行李 | expert | 2a7f13a2-6c4f-5bdd-88f9-594c360c7ce3 |

boarding pass仍作票證語意的延伸；不把同一白紙硬教成不同用途的兩張票。其他機場設施選配、必要缺詞與本次補圖完成紀錄見[製作計畫](airport-facilities-additions.json)。

26詞故事與逐句翻譯草案（baggage cart尚缺詞；未完整token映射、未產音）：

At the busy airport terminal, an airplane waits outside the window.

在繁忙的機場航廈，一架飛機停在窗外等候。

A baggage cart carries suitcases outside.

外面有一台行李拖車載運著行李箱。

A passenger carries a heavy bag and waits in line near the gate.

一位乘客提著沉重的旅行袋，在登機門附近排隊等候。

There is an empty seat beside the line.

隊伍旁邊有一個空座位。

A clock hangs above a screen.

螢幕上方掛著一個時鐘。

A woman in a uniform checks each ticket.

一位穿制服的女士核對每張票券。

A boy shows his ticket to her.

一個男孩向她出示票券。

His family is ready to board the airplane through the passage inside the airbridge.

他的家人已準備好經由空橋內的通道登機。

可重用素材：

- 原v1保留；v2以原圖為目標單次編修。
- docs/scenarios/basic-advance-batch-01.md#scenario-23
- docs/scenarios/preparation/basic-advance-01/author-15-27.json (airport-gate)

剩餘限制：拖車在窗外背景，尚需手機放大與標籤可讀性驗收；ticket、busy、heavy、ready、terminal需故事語境。圖片完成不代表詞卡、音訊、套件或正式教材完成。

## 2. 飯店櫃檯入住與周邊服務

底圖v1已生成並保存：[圖片](../../../../output/imagegen/travel-hotel-check-in-base-2026-11-11-v1/base.png)／[提示詞與逐詞看圖紀錄](../../../../output/imagegen/travel-hotel-check-in-base-2026-11-11-v1/README.md)。初步視覺檢查可見四區及29詞線索，待使用者審閱；未匯入或發布。

在飯店櫃檯辦理入住，並延伸寄放行李、取用旁邊茶水與索取衛浴備品。

候選 29 詞：23 名詞、1 形容詞、5 動詞。模式：user-specified。預定 revision 1 僅為規劃，尚未正式查核同 key 版本。

畫面配置：

- 中央：接待員與辦理入住住客，護照／房卡／服務鈴／簽名表格。
- 一側：寄放行李架與行李推車，旅客把行李交給員工保管。
- 另一側：小型茶水桌，清水／茶／咖啡與杯子。
- 靠櫃檯側邊：可索取備品整齊放在托盤／架上，非散放於辦理手續的檯面。

| 單字 | 詞性 | 本場詞義 | 字庫級別 | 來源 GUID | 預定畫面線索 |
| --- | --- | --- | --- | --- | --- |
| receptionist | n | 櫃檯接待員 | 未分級 | 54daab02-3e05-5bc6-b34f-d92a5e82f47d | 微笑站在接待櫃檯後、遞出房卡的人員 |
| guest | n | 住客 | advance | ac639252-b530-5342-933b-75737f80bee2 | 站在櫃檯前辦理入住的旅客 |
| front desk | n | 飯店櫃檯；接待處 | 未分級 | 7ed4358f-a905-5da4-b09e-9927b02a21b8 | 畫面中央長櫃檯及後方接待員，避免另用counter重複標同物件 |
| passport | n | 護照 | expert | 8315fb35-d242-58af-8aaa-638a878ad478 | 住客打開放在櫃檯上的護照，內頁不畫可辨識個資或文字 |
| key card | n | 房卡 | 未分級 | d3df4812-78a5-59b2-ac81-adb2d6f8d5e6 | 接待員遞給住客的感應房卡，不以實體鑰匙代替 |
| bell | n | 服務鈴 | basic | 078d0d47-f1ea-5158-a992-e0cf22e830bd | 櫃檯一角的按壓式服務鈴 |
| form | n | 表格 | advance | c632fa33-c99b-53e3-ad58-565f4f627aa4 | 另一名住客正簽名的表格，僅畫無可辨識文字的欄線 |
| pen | n | 筆 | basic | 282b8be9-2b82-55c0-bbf7-937ac14a6ae7 | 住客正用來在入住表格上簽名的筆 |
| reservation | n | 訂房；預訂 | expert | 2ab3adfa-132e-53aa-8b51-8840f3b24192 | 住客向接待員展示手機訂房確認畫面（只畫床／日期圖示、無文字）；訂房預約屬抽象概念，需故事明確說明，不以外觀宣稱可獨立辨認 |
| luggage | n | 行李（不可數） | expert | 2a7f13a2-6c4f-5bdd-88f9-594c360c7ce3 | 櫃檯旁等待寄放的整組旅行袋與行李箱；整組與單件suitcase分開指向 |
| suitcase | n | 行李箱 | expert | 25804565-39d9-579e-a864-5fbf2c16ac0d | 寄放區一只清楚可辨的拉桿行李箱 |
| cart | n | 推車 | expert | 0759e0ab-6df9-5d84-b87a-8723f0cbbec4 | 櫃檯旁運送行李的推車，與寄放架相鄰 |
| tag | n | 吊牌；標籤 | expert | fb971edd-d6c7-5aca-b3ea-a3ae8f061ce3 | 行李箱拉桿上的寄放識別吊牌，不畫可辨識編號或文字 |
| water | n | 水 | basic | a77ddbc4-de0a-5abd-8ec5-e9463796a63f | 茶水桌上透明水壺與裝有清水的杯子 |
| tea | n | 茶 | basic | 0479b7b6-5c9e-52ad-a0ad-315383f1dae3 | 茶水桌上的茶壺與淺色茶湯；與coffee精確辨識仍需故事輔助 |
| coffee | n | 咖啡 | basic | f2012afd-cdba-5945-9501-b702b7f77697 | 茶水桌另一端咖啡壺與深色咖啡，和茶分開擺放 |
| cup | n | 杯子 | basic | 3f4ac044-15a8-5478-b999-f3cb7e8346cc | 茶水桌前方整齊擺放的乾淨杯子 |
| toothbrush | n | 牙刷 | advance | c9168ced-5598-59ec-97fb-ea0aebb3b5bc | 櫃檯旁整齊備品托盤中的獨立包裝牙刷，保留可辨刷頭輪廓 |
| toothpaste | n | 牙膏 | 未分級 | 22ed6dc4-fb2b-5f32-b2a4-dc246001483f | 與牙刷配對的小條牙膏，靠造型和故事輔助區別 |
| towel | n | 毛巾 | basic | 6b4451ae-c5c2-5a93-bec3-f5bcf84454ba | 備品架上摺好的乾淨毛巾 |
| shampoo | n | 洗髮精 | expert | 5cfec1b4-ffd9-5eee-a091-03050d3a2921 | 備品托盤中的旅行用洗髮精小瓶；無文字圖需故事說明用途 |
| soap | n | 肥皂 | advance | 0927b804-fc43-5b49-96dc-fc5a9019db2c | 備品托盤中的獨立包裝塊狀肥皂，與小瓶洗髮精分開 |
| friendly | adj | 友善的 | basic | d4a52a3b-301c-5aaf-a4cb-9dce7fc771d5 | 接待員微笑迎接住客 |
| porter | n | 行李員 | expert | 028397a3-6eb3-5491-8662-0b0908345941 | 穿工作制服、替旅客把寄放行李掛上吊牌並放上推車的行李員 |
| check in | v | 辦理入住 | 未分級 | 3fff15bc-769e-5cbb-a408-3b0f7b72046e | 住客在櫃檯辦理入住的整體互動 |
| leave | v | 留下（在此以leave luggage表達寄放行李） | basic | 8a0343b8-ec63-5130-a620-bbe27c39d368 | 旅客把行李交由員工保管，須故事明確說明暫放，不教成離開 |
| ask | v | 詢問；索取 | basic | 03abf7fa-221b-5664-9ec5-ae00066d6ae9 | 住客向接待員詢問能否寄放行李或索取牙刷，故事補足語意 |
| give | v | 給予；遞給 | basic | c152897e-e0f7-51d2-9eea-18f032cc8802 | 接待員把房卡遞給住客 |
| sign | v | 簽名 | basic | 4109ddc1-c73c-5bc6-8fb8-74d95b3b107f | 另一名住客用筆在表格上簽名，不畫可辨識簽名 |

延伸／替代候選（未列入主候選）：

| 單字 | 詞性 | 詞義 | 原始級別 | 來源 GUID | 畫面與採用注意 |
| --- | --- | --- | --- | --- | --- |
| counter | n | 櫃檯 | expert | f020a23d-7efe-5a09-bc8d-b4d0865beada | 與front desk同義範圍重疊，本場若採front desk則不重複標同一櫃檯 |
| reception | n | 接待處 | expert | 25f35f65-cc16-575d-a25c-2030cc072de9 | 與front desk重疊，留作延伸查詞 |
| hot | adj | 熱的 | basic | ae090007-85fc-5755-bfb8-15ba9163a613 | 茶杯上方輕微蒸氣，杯子穩放於茶水桌 |
| storage | n | 儲存；存放 | expert | d7ce9a62-0e6d-517a-a529-3f8d6801a791 | 行李寄放區，字庫已有一般儲存解釋，但整體詞卡能源例句偏多，選用前需審閱 |
| store | v | 存放；保管 | basic | b2bf583f-2b66-56aa-abe8-a8f0fe006771 | 飯店替旅客保管行李；leave已能完成寄放對話，不重複加動詞 |
| bottle | n | 瓶子 | basic | 02816e5e-8676-5dde-b51b-67edaa00327e | 茶水桌上的瓶裝水，可替換coffee或其他名詞 |
| dispenser | n | 分配器 | 未分級 | f50f6407-0a48-5a28-88e7-94f9418a6892 | 茶水設備可出現，但字庫技術釋義／例句占比較高，不優先當本場目標 |
| helpful | adj | 樂於助人的 | basic | 2599cb0d-c590-5e3f-b718-0ec19236347a | 人員協助搬運行李，與friendly不同重點，可替換或拆場再用 |
| free | adj | 免費的 | basic | ac695b43-6b36-5623-a553-29cd262468e1 | 收費與否不能單靠無文字圖片判斷，先不主張備品或茶水必然免費 |
| hotel | n | 飯店 | basic | be58d6e2-0954-5554-aaff-53dce6b0b295 | 整體場所可在標題與故事表達，本場圖上先聚焦櫃檯服務 |
| heavy | adj | 沉重的 | basic | 6b8d21a1-e26b-56f1-9fd2-6713b1a97a13 | 一名員工用力將行李箱放上推車，呈現重量 |
| clean | adj | 乾淨的 | basic | d3de04c7-7cbc-5dec-9cf0-8bd9fa5be0d5 | 整齊潔淨的白毛巾與杯子；非要求同圖加入髒污對比 |

可搭配的服務對話（完整句子不是單一字庫詞條；支援詞尚未逐 token 對應）：

- Can I leave my luggage here? — 我可以把行李寄放在這裡嗎？
- Could I have a toothbrush and some toothpaste? — 可以給我一支牙刷和一些牙膏嗎？
- Is there any tea or water? — 有茶或水嗎？

可選完整片語缺詞：

- luggage tag：離線來源沒有 exact 詞條；以已有tag標行李吊牌即可；若要完整片語作單一詞卡需先補新詞。
- luggage cart：離線來源沒有 exact 詞條；以已有cart標推車即可；若要完整片語作單一詞卡需先補新詞。
- baggage storage：離線來源沒有 exact 詞條；本場以leave luggage完整語境表達寄放，不必新增此片語。
- toiletries：離線來源沒有 exact 詞條；以toothbrush／toothpaste／towel／shampoo／soap具體備品分別學習；若要總稱詞卡需先補新詞。

上述缺詞均非本次29主選的必要項目，沒有新增GUID或入庫。


故事與逐句翻譯草案（待選詞、構圖與 token 對應確認，不是可匯入定稿）：

At the hotel front desk, guests check in with a friendly receptionist.

在飯店櫃檯，住客向友善的接待員辦理入住。

One guest has a reservation and shows her passport.

其中一位住客有訂房，並出示她的護照。

Another guest uses a pen to sign a form while the receptionist gives the woman a key card.

另一位住客用筆在表格上簽名，同時接待員把房卡交給那位女士。

A bell sits on the desk.

櫃檯上放著一個服務鈴。

Another guest asks, “Can I leave my luggage here?”

另一位住客問：「我可以把行李寄放在這裡嗎？」

A porter puts a tag on a suitcase and sets it on a cart.

一位行李員在行李箱上掛上吊牌，並把它放到推車上。

Beside the desk, travelers can have water, hot tea, or coffee in a cup.

在櫃檯旁邊，旅客可以用杯子取用水、熱茶或咖啡。

A nearby shelf holds a towel, soap, shampoo, a toothbrush, and toothpaste.

附近的架上放著毛巾、肥皂、洗髮精、牙刷與牙膏。

A guest asks for a toothbrush, and another receptionist gives one to him.

一位住客索取牙刷，另一位接待員拿了一支給他。

可重用素材：

- docs/scenarios/basic-advance-batch-01.md#scenario-24 (客房非入住櫃檯，僅旅程脈絡)
- docs/scenarios/preparation/basic-advance-01/author-15-27.json (hotel-room-arrival，僅文字參考)

## 3. 搭乘渡輪

底圖v1已生成並保存：[圖片](../../../../output/imagegen/travel-ferry-trip-base-2026-11-11-v1/base.png)／[完整提示詞](../../../../output/imagegen/travel-ferry-trip-base-2026-11-11-v1/prompt.txt)／[逐詞看圖紀錄](../../../../output/imagegen/travel-ferry-trip-base-2026-11-11-v1/README.md)。主候選19詞已有可見或語境錨點，待使用者審圖；未匯入或發布。

已開航後坐在甲板看海；不混入碼頭登船動作。

候選 19 詞：12 名詞、3 形容詞、4 動詞。模式：default-graded。預定 revision 1 僅為規劃，尚未正式查核同 key 版本。

| 單字 | 詞性 | 本場詞義 | 字庫級別 | 來源 GUID | 預定畫面線索 |
| --- | --- | --- | --- | --- | --- |
| ship | n | 輪船 | basic | 96cf64be-8c0c-5c98-be51-5c7390022225 | 已開航的主要客輪，與渡輪精確詞義另列擴充 |
| boat | n | 小船 | basic | b3f83a04-74e9-5f11-bbc0-f0077de4503f | 主客輪附近一艘獨立可辨識的小船，不將同一艘大船同時標兩詞 |
| passenger | n | 乘客 | advance | fed03f94-0206-56c3-8136-5cbb4dc374a4 | 坐在船上看海的旅客 |
| captain | n | 船長 | advance | 497d172e-c9cc-5102-9c8d-11b3525b7f00 | 駕駛室內掌舵的船長，構圖須能看見 |
| sailor | n | 船員 | advance | 6e192f4e-eef0-5cc6-9214-fc485bbcf615 | 整理纜繩或引導旅客的制服船員 |
| sea | n | 大海 | basic | 8dc4dce9-961b-5e4d-a918-0697b883bb57 | 船外大片海面 |
| island | n | 島嶼 | basic | 2f1775be-7a7b-5b14-bd7f-ba4680753a57 | 航向遠方可見的一座小島 |
| wave | n | 波浪 | basic | b1140533-37c0-5cc3-9a64-63d17ad3b171 | 船身旁清楚的白色波紋 |
| rope | n | 繩索 | basic | cc4761b9-093c-5995-8370-13c594a385f4 | 甲板角落整齊盤好的粗繩 |
| flag | n | 旗幟 | advance | 8128f3ea-350f-5cff-9e35-71603d504df7 | 船上被風吹起的旗幟 |
| bench | n | 長椅 | basic | d82e9391-94d2-5384-89e4-2b674f37e41a | 乘客乘坐的船上長椅 |
| bag | n | 旅行袋 | basic | be63fd22-30f2-55f4-88d1-5633149ddd18 | 長椅邊固定妥當的旅行袋 |
| sunny | adj | 晴朗的 | basic | ac615d17-79b1-5d3b-a406-80e798f57c9f | 陽光明亮的天空與海面 |
| windy | adj | 風大的 | basic | 65fef98d-c94b-5d64-aebc-d886b2c9779c | 迎風飄起的旗幟與乘客頭髮 |
| large | adj | 大型的 | basic | 8c673a17-80ef-5081-b2ac-c59e07b86e44 | 主客輪與旁邊小船形成可見大小對比 |
| sail | v | 航行 | basic | e58393a2-bf7e-5095-9a69-271db58d9bae | 客輪後方的航跡顯示正在航行；sail不要求帆船 |
| sit | v | 坐著 | basic | c7cebf58-68f7-5296-b1dd-d81806393e06 | 旅客坐在長椅上 |
| hold | v | 握住 | basic | 954342d3-d873-596f-9763-1385be49c458 | 旅客握著帽子避免被風吹走 |
| watch | v | 觀看 | basic | bfb9abd8-8bfe-54d6-a8cf-0912b81263db | 孩子看向海面與遠方小島 |

延伸／替代候選（未列入主候選）：

| 單字 | 詞性 | 詞義 | 原始級別 | 來源 GUID | 畫面與採用注意 |
| --- | --- | --- | --- | --- | --- |
| ferry | n | 渡輪 | expert | 9e60828b-0818-59d6-bd0b-7e42312ffb14 | 已開航並往返固定航線的客輪，須旅程語境確認功能 |
| deck | n | 甲板 | expert | e2a2672e-1e24-5f43-ba41-d539c1890dd8 | 露天座位所在的船面 |
| life jacket | n | 救生衣 | 未分級 | d7a8c0cf-a2ee-5683-81d7-10fc01c7a301 | 旅客身上或固定架上的救生衣 |
| harbor | n | 港口 | expert | 76cded7d-0321-5adf-9a19-ea8aa7ca2308 | 客輪出發處的碼頭與港灣 |
| railing | n | 欄杆 | 未分級 | 3ecfd5b1-9085-5b3b-afdb-fc3f712a5ad7 | 客輪外緣的安全欄杆 |

故事與逐句翻譯草案（待選詞、構圖與 token 對應確認，不是可匯入定稿）：

On a sunny day, a large ship sails across the sea toward an island.

在晴朗的一天，一艘大船航行在海上，朝一座島嶼前進。

A small boat passes near the ship.

一艘小船從大船附近經過。

The captain is at the front, and a sailor works with a rope below a flag.

船長在船的前方，一位船員在旗幟下方整理繩索。

A passenger sits on a bench with a bag beside him.

一位乘客坐在長椅上，身旁放著旅行袋。

It is windy, so he holds his hat.

風很大，所以他按住自己的帽子。

A child watches a wave beside the ship.

一個孩子看著船邊的一道波浪。

可重用素材：

- 既有批次未找到同主題素材；本輪底圖已生成，旁白尚未製作。

## 4. 飛機上的餐飲與艙等體驗

底圖v1已生成：[圖片](../../../../output/imagegen/travel-airplane-cabin-base-2026-11-11-v1/base.png)／[完整提示詞](../../../../output/imagegen/travel-airplane-cabin-base-2026-11-11-v1/prompt.txt)／[逐詞看圖紀錄](../../../../output/imagegen/travel-airplane-cabin-base-2026-11-11-v1/README.md)。

同一航班飛行中的客艙生活：開行李艙、餐飲服務與用餐，觀察椅背娛樂、窗外雲／機翼／引擎及商務／經濟艙配置。

候選29詞＝22名詞＋3形容詞＋4動詞，採user-specified。27詞已有canonical GUID，兩個艙等完整詞條必要缺詞保留null；這是圖片與候選規劃，不是可匯入套件。預定revision 1尚未正式查核或匯入。

| 候選詞 | 詞性 | 本場詞義 | 原級別 | 來源GUID／狀態 |
| --- | --- | --- | --- | --- |
| cabin | n | 機艙 | expert | 82f9dfae-be12-5e40-9e28-64a596c44b1c |
| flight attendant | n | 空服員 | 未分級 | 487f57e3-2622-5a43-a4ac-b1942ba0c5bb |
| passenger | n | 乘客 | advance | fed03f94-0206-56c3-8136-5cbb4dc374a4 |
| overhead bin | n | 頭頂行李艙 | 未分級 | 187524fa-5545-564b-bcfe-99d01f5f3f27 |
| luggage | n | 行李（不可數） | expert | 2a7f13a2-6c4f-5bdd-88f9-594c360c7ce3 |
| cart | n | 推車 | expert | 0759e0ab-6df9-5d84-b87a-8723f0cbbec4 |
| meal | n | 餐點 | basic | baa065dc-cba6-5f02-8cd1-12cee47382bd |
| tray | n | 托盤；餐盤 | expert | da59f650-66c8-5d96-a95d-81722978e727 |
| seat | n | 座位 | basic | accb9ef6-d6e7-52b8-a363-0ab9db325e1a |
| screen | n | 螢幕 | basic | 8ed10464-d75f-5b84-853d-c464b6d069c7 |
| headphones | n | 耳機 | expert | 6cccc2aa-78ea-512a-848b-2c3b7c0b3fb4 |
| magazine | n | 雜誌 | advance | 13434369-9007-5f2f-b817-ea2f4530beb7 |
| window | n | 窗戶 | basic | 895fce7b-e5c4-51d8-8fa6-f8caa1f97b38 |
| cloud | n | 雲 | basic | 70818df1-ee97-590f-8dbb-7da3592f99d1 |
| wing | n | 機翼 | advance | bdc4f531-cfef-530d-931a-55c56b14eaf8 |
| engine | n | 引擎 | advance | 2b5a7b0d-2eb9-5a07-9cc9-7fb253196031 |
| business class | n | 商務艙 | 未分級 | 必要缺詞，GUID=null，待補 |
| economy class | n | 經濟艙 | 未分級 | 必要缺詞，GUID=null，待補 |
| cup | n | 杯子 | basic | 3f4ac044-15a8-5478-b999-f3cb7e8346cc |
| water | n | 水 | basic | a77ddbc4-de0a-5abd-8ec5-e9463796a63f |
| juice | n | 果汁 | basic | 5d8a4c5a-613d-5672-a950-9f50f2c79e1a |
| plate | n | 盤子 | basic | 1724da63-6c1a-5b15-bc9a-208b6fc0f7c8 |
| open | v | 打開 | basic | cf98907f-2be1-5741-9d48-73d93e9585fe |
| serve | v | 供餐；遞送 | advance | f7119668-da06-5011-bad5-08f375197a28 |
| eat | v | 吃；用餐 | basic | 994e2df3-f6a5-5db8-bcc1-ce8a22c6d1cc |
| drink | v | 喝 | basic | b22d9f98-ee18-517b-a63d-fa0da15edb66 |
| comfortable | adj | 舒適的 | basic | c4621bd5-027d-5dce-92e1-3d5bca38f8ac |
| wide | adj | 寬的 | basic | d6a9a9a3-9543-5271-babd-8e6dfc745708 |
| narrow | adj | 較窄的 | advance | dade0436-5fd9-5c66-a879-8df16a8d9e53 |

必要缺詞與可選完整片語缺口見[字庫缺口規劃](airplane-cabin-vocabulary-gaps.json)。business class／economy class沒有被拆成business／economy來假冒完整詞條。cart與screen沿用既有詞，在圖中明確表現餐車與椅背螢幕。

故事與逐句翻譯草案（尚缺兩必要詞，未做完整token映射，未產音）：

Inside the cabin, a passenger opens an overhead bin with luggage inside.

在機艙內，一位乘客打開上方放著行李的行李艙。

In business class, the seats are wide and comfortable.

商務艙的座位寬敞又舒適。

A traveler eats a meal from a plate, while another seat holds a pillow and a blanket.

一位旅客吃著盤中的餐點，另一張座位上放著枕頭與毯子。

Behind a curtain, economy class has narrow seats arranged in rows.

隔簾後方的經濟艙，較窄的座椅一排排排列。

One flight attendant serves a tray to a passenger beside a cart.

一位空服員在餐車旁，將托盤遞給乘客。

The cart holds water, juice, and more meals.

餐車上放著水、果汁與更多餐點。

Another flight attendant pours juice into a cup.

另一位空服員把果汁倒進杯子。

A passenger wears headphones and drinks from his cup.

一位乘客戴著耳機，用杯子喝飲料。

A magazine sits in a pocket below a screen.

螢幕下方的口袋裡放著一本雜誌。

Clouds fill the view through each window, and the wing and engine are outside the cabin.

透過窗戶可以看見雲，機翼與引擎則位於機艙外。

圖片採剖視示意；兩艙等依座椅配置暗示，需故事指認。外部機翼與引擎可見，不冒稱完整外觀全都從單一正常窗戶看見。

可重用素材：本輪已生成底圖；既有同場旁白未製作。

## 共用待辦與實際狀態

- 原三場製作時主候選皆有GUID；機場新增baggage cart已補畫於v2，字庫詞條仍缺。機艙另缺business class／economy class兩個必要完整詞條。三個必要缺詞均未分配GUID或入庫，其他可選片語缺口另列。正式 DB 是否已有同詞及有效錄音尚未核對。
- 機場舊草稿可參考；飯店既有草稿是抵達客房，不是櫃檯入住，不能直接當同場教材重用。沒有恢復既有暫停批次。
- 底圖採明亮、溫暖、可愛3D卡通寬幅構圖；圖內不畫可辨識英文、翻譯或答案。螢幕、護照與表格只保留外觀。
- 飯店本輪選用 key card 房卡；原實體key、bag、sofa、lamp、door、window等移出主詞表，改以櫃檯服務及備品為重點。規劃尚未匯入，因此不升教材revision。
- front desk 與 counter 不重複標同一櫃檯。luggage 是不可數的行李總稱，suitcase 是單件行李箱。leave 的本義為留下，由完整句 Can I leave my luggage here? 表達寄放，不把leave單字直接等同「寄放」。
- reservation 較抽象，茶／咖啡與洗髮精也難靠無文字圖精確區分；仍需故事指認並在實際底圖驗收時調整。若主圖過密，可減少延伸細節或將茶水／備品拆成後續場景，不能跳過每詞線索驗收。
- 本場茶水與備品是教材設定，不宣稱所有飯店均提供，也未將免費列為主候選。
- 教材完成：否；正式draft匯入：否；品質可發布：未驗收；已發布：否；程式已部署：本輪無部署。
- 原四場底圖均已依授權生成並核對；機場v2已補上baggage cart並保存，原v1未變。baggage cart及兩個機艙艙等詞條仍待補庫；使用者審圖仍待完成。音訊、互動座標、套件check、dry-run、正式庫及UI尚未驗收；不得把本批檔案當scenario content匯入。
- 本批新增四場圖片與製作紀錄，沒有應用程式改動，未執行npm test或typecheck；提交前仍須依AGENTS.md跑必要指令。

四場底圖狀態：四場現用底圖均已保存，機場另保留v1；機場26候選（25既有＋1缺詞，圖已補齊），飯店29詞，渡輪19詞，機艙29候選（27既有＋2必要缺詞）。本輪已實際編修機場圖並更新26詞故事草案，未完成完整教材或正式發布。
