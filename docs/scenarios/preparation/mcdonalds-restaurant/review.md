# 餐廳：麥當勞四個情境備料與生成紀錄

日期：2026-10-12。階段：四場教材素材與正式匯入已完成；第四場目前為已發布 revision 2（Recycling Symbol 改 floor），前三場已發布 revision 1，餐廳標籤 24；37 新詞與必要音檔已入庫，api／web-learner 已健康更新。完整人工試聽與品質／角色驗收待完成；本 agent 未執行發布；後續唯讀核對四場皆已發布。

使用者原指定四場各 15 個名詞，共 60 詞次；2026-10-11 後續要求補齊形容詞與動詞，各場依原名詞補 5 個形容詞、5 個動詞；第四場 r2 依使用者修正將 Recycling Symbol 換成 floor；使用者另要求第一場加入套餐、單點、內用、外帶並明確選擇調整程式上限，因此第一場 29 項，其餘各 25 項，四場合計 104 詞次。分類為「餐廳」，麥當勞是四場共同主題。以下保存已認可故事與逐句翻譯；四場 GUID／完整片語映射已完成，新增 GUID 已正式入庫；下列第四場故事與詞表已同步 r2；原 r1 套件與生成素材保留未覆寫。

## 共用方向

- 四場依「認識餐廳 → 點餐 → 用餐 → 整理離開」排序；建議沿用兩位小朋友、一位陪同大人與相同餐廳配置。
- 明亮、溫暖、可愛 3D 卡通，16:9 寬幅；英文標籤由網站疊加。底圖不含可讀文字、價錢、教學箭頭或答案。
- 金色拱門、紅黃配色與餐盒造型作品牌線索；菜單與自助點餐機使用食物圖示，出口與回收採圖像符號。
- 各場皆為 15 個名詞與 5 個形容詞／5 個動詞（第四場 r2 取代一個名詞）；第一場另加 4 個模式，實際詞性為 17 n／7 adj／5 v，共 29 項；其餘各 25 項。Others 若作詞庫分類，不取代情境的名詞教學詞性；實際欄位與相容性見詞庫盤點。
- 使用者已確認同批次目標詞「盡量」不重複，不作硬性全去重；故事支援詞可以自然重用。本次 40 個補詞可安排為 40 個不同詞。
- 使用者「超過一個字」暫按「由兩個以上英文單字組成的完整詞條」理解，連字號詞也視完整詞組。缺詞才準備新增；已有相同拼字與適用詞義者優先重用 GUID。37 缺詞已正式新增並同步來源；本機缺音已逐場補齊且匯入正式 volume／metadata。

## Scene 1：McDonald's Restaurant 🏠／認識麥當勞餐廳

活動：第一次進店，認識各區域與人物。採室內廣角，左側入口、右側出口、後方點餐區、前景座位區，旁側透過玻璃看見小型遊戲區。這是為教材設計的餐廳，不代表每間分店皆有遊戲區。

| 目標詞 | 原指定意思 | 圖中線索 |
| --- | --- | --- |
| Restaurant | 餐廳 | 整個室內場景與入口外的品牌圖像 |
| Entrance | 入口 | 孩子與大人正在進入的門 |
| Exit | 出口 | 另一側通往外面的出口門 |
| Counter | 櫃檯 | 點餐櫃檯整體 |
| Cashier | 收銀員 | 櫃檯後正在接單的人 |
| Customer | 顧客 | 櫃檯前正在點餐的人 |
| Menu Board | 菜單看板 | 櫃檯上方食物圖片看板 |
| Self-Service Kiosk | 自助點餐機 | 獨立直立式觸控點餐設備 |
| Cash Register | 收銀機 | 櫃檯上的收銀設備與錢箱 |
| Table | 桌子 | 前景完整餐桌 |
| Chair | 椅子 | 餐桌旁一張清楚的椅子 |
| Dining Area | 用餐區 | 有數張桌椅的整個區域 |
| Kitchen | 廚房 | 櫃檯後可見的備餐工作區 |
| Employee | 店員 | 另一位正在送餐的店員，與收銀員區分 |
| Playground | 遊戲區 | 玻璃隔間內的小型溜滑梯與遊戲設施 |

新增形容詞與動詞（各 5 個）：

| 詞性 | English | 本次意思 | 圖中線索 |
| --- | --- | --- | --- |
| adj | bright | 明亮的 | 大窗戶日光與室內照明 |
| adj | tidy | 整潔的 | 用餐區桌椅擺放整齊，桌面收拾妥當 |
| adj | large | 寬大的 | 寬敞的用餐區與多組桌椅 |
| adj | friendly | 親切的 | 收銀員微笑接待顧客 |
| adj | busy | 忙碌的 | 店員備餐與顧客點餐的熱鬧景象 |
| v | enter | 進入 | 主角一家正穿過入口 |
| v | wait | 等候 | 櫃檯前排隊等候的顧客 |
| v | pay | 付款 | 另一位顧客使用卡片付款 |
| v | work | 工作 | 店員在廚房備餐 |
| v | play | 玩耍 | 遊戲區的背景孩子玩溜滑梯 |

味覺／觸感／新鮮程度採圖像線索配合故事說明，不把靜態圖片當成直接證明。動作分配給不同人物，背景人物只支援本場活動。

新增點餐與用餐模式（使用者追加的 4 項）：

| 詞性 | English | 本次意思 | 圖中線索 |
| --- | --- | --- | --- |
| n | Combo Meal | 套餐 | 漢堡、薯條與飲料放在同一個托盤，與旁邊單點漢堡對照 |
| adj | À la carte | 單點（的） | 單獨一份漢堡，與整組套餐對照；菜單採圖片，不燒入價格或文字 |
| adj | Dine-in | 內用（的） | 座位區坐著享用餐點的顧客 |
| n | Takeout | 外帶（餐點） | 拿著餐點紙袋向出口走去的顧客 |

Combo Meal 是套餐組合；À la carte 用形容詞義「單點的」，Dine-in 用服務模式的形容詞義「內用的」，Takeout 是外帶餐點名詞。保留正確詞性，不把四項全部硬歸名詞；字庫用法與來源見 [四模式盤點](ordering-modes-audit.json)。四項在匯入前來源 JSON 都缺詞；本輪已新增並使用正式 GUID，保留原盤點作歷史證據。

故事定稿（29 項版，離線 GUID／完整片語映射已完成）：

1. **This bright restaurant has a large dining area.** 這間明亮的餐廳有一個寬大的用餐區。
2. **Two children enter through the entrance with an adult.** 兩位小朋友和一位大人從入口進入。
3. **A tidy table and a chair are ready for them.** 一張整潔的桌子和一張椅子正等著他們。
4. **At the counter, a friendly cashier helps a customer while others wait nearby.** 在櫃檯旁，一位親切的收銀員協助顧客，其他人在附近等候。
5. **The menu board shows pictures of food.** 菜單看板上有餐點圖片。
6. **Another customer uses a card to pay beside the cash register.** 另一位顧客在收銀機旁使用卡片付款。
7. **A customer also uses the self-service kiosk.** 也有一位顧客使用自助點餐機。
8. **The restaurant is busy, and people work in the kitchen.** 餐廳裡很忙碌，廚房裡有人正在工作。
9. **An employee brings food to the counter.** 一位店員把餐點送到櫃檯。
10. **Through the glass, the children see other children play in the playground.** 小朋友透過玻璃，看見其他孩子在遊戲區玩耍。
11. **A combo meal includes a burger, fries, and a drink.** 套餐包含漢堡、薯條和飲料。
12. **The à la carte menu lets customers choose each item.** 單點菜單讓顧客選擇每一樣餐點。
13. **Dine-in customers enjoy their food in the dining area.** 內用的顧客在用餐區享用餐點。
14. **Another customer carries takeout in a paper bag toward the exit.** 另一位顧客拿著裝在紙袋裡的外帶餐點走向出口。
15. **The exit is on the other side of the room.** 出口在室內的另一側。

討論重點：29 個學習項目需要廣角與分區；Counter／Cash Register、Cashier／Employee、Restaurant／Dining Area 各自保留不同指向位置。進店、等候、付款、工作與玩耍分配給不同人物，不要求同一個孩子同時做所有動作。

## Scene 2：Let's Order Food! 🍟／一起點餐吧！

活動：在櫃檯選餐。畫面主角是選擇餐點，不讓孩子吃下全部品項。可用無文字食物圖示菜單與前景餐點展示；五種漢堡露出不同內餡，大麥克採雙層肉排與中層麵包，雞肉與魚肉餐點已在第二場 v2 以不同內餡核對辨識度。

| 目標詞 | 原指定意思 | 圖中線索 |
| --- | --- | --- |
| Hamburger | 漢堡 | 露出肉排的基本漢堡 |
| Cheeseburger | 起司漢堡 | 起司片明顯的漢堡 |
| Big Mac | 大麥克 | 雙層肉排與中層麵包的漢堡 |
| Chicken Burger | 雞肉漢堡 | 露出雞肉切面的漢堡 |
| Fish Burger | 魚肉漢堡 | 露出白色魚肉切面的漢堡 |
| French Fries | 薯條 | 紅色紙盒中的細長薯條 |
| Chicken Nuggets | 雞塊 | 打開餐盒中數塊雞塊 |
| Hash Brown | 薯餅 | 橢圓扁平、金黃薯餅 |
| Apple Pie | 蘋果派 | 切開可見蘋果餡的長方形派 |
| Ice Cream Cone | 蛋捲冰淇淋 | 蛋捲筒上的白色霜淇淋 |
| Sundae | 聖代 | 透明杯中的冰淇淋與淋醬 |
| Soft Drink | 汽水 | 透明示意杯中有氣泡的飲料 |
| Orange Juice | 柳橙汁 | 橘色飲料與旁邊的柳橙圖示 |
| Milk | 牛奶 | 白色飲料與無文字牛奶容器 |
| Happy Meal | 快樂兒童餐 | 提把餐盒與旁邊的小玩具 |

新增形容詞與動詞（各 5 個）：

| 詞性 | English | 本次意思 | 圖中線索 |
| --- | --- | --- | --- |
| adj | hot | 熱的 | 薯條上方少量熱氣 |
| adj | cold | 冰的；冷的 | 汽水杯中的冰塊與外側凝結水珠 |
| adj | crispy | 酥脆的 | 薯餅剖面與酥脆外皮；口感由故事補強 |
| adj | sweet | 甜的 | 聖代淋醬與甜點展示；味道由故事補強 |
| adj | small | 小的 | 小份薯條與較大份量形成對比 |
| v | choose | 選擇 | 孩子在食物圖片前作選擇 |
| v | point | 指向 | 另一位孩子指著菜單上的漢堡 |
| v | order | 點餐 | 孩子向收銀員表達選擇 |
| v | receive | 領取（餐點） | 大人從收銀員手中接過餐點托盤 |
| v | carry | 端著；攜帶 | 背景顧客端著托盤離開櫃檯 |

味覺／觸感／新鮮程度採圖像線索配合故事說明，不把靜態圖片當成直接證明。動作分配給不同人物，背景人物只支援本場活動。

故事定稿（25 詞版，離線 GUID／完整片語映射已完成）：

1. **The children are ready to order food and choose their meals.** 小朋友準備好點餐，選擇自己的餐點。
2. **They point to pictures of a hamburger and a cheeseburger.** 他們指著漢堡和起司漢堡的圖片。
3. **One picture shows a Big Mac with an extra bun in the middle.** 一張圖片上有一個中間多一層麵包的大麥克。
4. **Other pictures show a chicken burger and a fish burger.** 其他圖片上有雞肉漢堡和魚肉漢堡。
5. **They choose a Happy Meal with chicken nuggets and a small serving of French fries.** 他們選了一份有雞塊和小份薯條的快樂兒童餐。
6. **The fries are hot, and a golden hash brown looks crispy.** 薯條是熱的，金黃色的薯餅看起來很酥脆。
7. **For a drink, one child chooses milk and the other chooses orange juice.** 飲料方面，一位小朋友選牛奶，另一位選柳橙汁。
8. **The adult chooses a cold soft drink with ice.** 大人選了一杯加冰的冰汽水。
9. **The children also look at an apple pie and an ice cream cone.** 小朋友也看看蘋果派和蛋捲冰淇淋。
10. **A sundae has sweet sauce on top.** 聖代上面淋著甜甜的醬。
11. **The adult is ready to receive the food from the cashier.** 大人準備從收銀員手中領取餐點。
12. **Nearby, other customers carry trays away from the counter.** 附近，其他顧客端著托盤離開櫃檯。

討論重點：這是彙整品項的教學展示，不宣稱所有品項在特定分店或同一供餐時段都有販售。Hash Brown／Apple Pie、Ice Cream Cone／Sundae 需不同造型。保留使用者用語，不擅自改 Chicken Burger／Fish Burger／Chicken Nuggets 為其他品牌品名。

## Scene 3：Let's Eat! 🍔／一起享用美食！

活動：坐下用餐，學習容器、包裝、餐具與食材。鏡頭靠近桌面，小朋友留在上方；漢堡略打開，清楚露出麵包、起司與生菜。Fork／Spoon 作桌上可用餐具，不要求畫面中人人同時使用所有餐具。

| 目標詞 | 原指定意思 | 圖中線索 |
| --- | --- | --- |
| Tray | 托盤 | 承裝餐點的托盤 |
| Cup | 杯子 | 一個完整飲料杯 |
| Straw | 吸管 | 插在另一個杯子中的吸管 |
| Lid | 杯蓋 | 桌上單獨擺放的杯蓋 |
| Napkin | 餐巾紙 | 乾淨、摺好的餐巾紙 |
| Wrapper | 食物包裝紙 | 攤開的漢堡包裝紙 |
| Paper Bag | 紙袋 | 桌旁立起來的外帶紙袋 |
| Food Box | 餐盒 | 打開的雞塊餐盒 |
| Fork | 叉子 | 桌上清楚分開的叉子 |
| Spoon | 湯匙 | 桌上清楚分開的湯匙 |
| Ketchup | 番茄醬 | 紅色番茄醬與番茄圖像小包裝 |
| Dipping Sauce | 沾醬 | 雞塊旁一盒棕色沾醬 |
| Burger Bun | 漢堡麵包 | 稍掀開的漢堡上層麵包 |
| Cheese | 起司 | 漢堡中露出的黃色起司片 |
| Lettuce | 生菜 | 漢堡中露出的綠色生菜葉 |

新增形容詞與動詞（各 5 個）：

| 詞性 | English | 本次意思 | 圖中線索 |
| --- | --- | --- | --- |
| adj | happy | 開心的 | 孩子用餐時的笑容 |
| adj | round | 圓形的 | 圓形漢堡麵包 |
| adj | soft | 柔軟的 | 漢堡麵包蓬鬆切面與輕壓痕；觸感由故事補強 |
| adj | fresh | 新鮮的 | 生菜的翠綠葉片；品質由故事補強 |
| adj | full | 滿的 | 裝滿薯條的紙盒 |
| v | sit | 坐 | 孩子坐在餐椅上 |
| v | eat | 吃 | 孩子把食物送向嘴邊 |
| v | drink | 喝 | 陪同大人使用吸管喝飲料 |
| v | dip | 沾 | 另一位孩子把雞塊沾進醬盒 |
| v | hold | 拿著 | 孩子手持漢堡 |

味覺／觸感／新鮮程度採圖像線索配合故事說明，不把靜態圖片當成直接證明。動作分配給不同人物，背景人物只支援本場活動。

故事定稿（25 詞版，離線 GUID／完整片語映射已完成）：

1. **The children sit down to eat, and they look happy.** 小朋友坐下吃東西，看起來很開心。
2. **A tray holds their food, and a paper bag stands beside it.** 托盤盛著他們的餐點，旁邊立著一個紙袋。
3. **One child holds a round burger above its wrapper.** 一位小朋友拿著圓形漢堡，食物包裝紙在下面。
4. **Under the soft burger bun, we can see cheese and fresh lettuce.** 在柔軟的漢堡麵包下面，我們可以看見起司和新鮮的生菜。
5. **The other child opens a food box of chicken nuggets.** 另一位小朋友打開裝著雞塊的餐盒。
6. **The child dips chicken nuggets into the dipping sauce.** 這位小朋友把雞塊沾進沾醬。
7. **A full box of French fries has ketchup beside it.** 一盒裝滿的薯條旁邊放著番茄醬。
8. **One cup has a straw, and a lid rests on the table beside another cup.** 一個杯子裡插著吸管，另一個杯子旁的桌上放著杯蓋。
9. **The adult drinks through a straw.** 大人用吸管喝飲料。
10. **A fork and a spoon lie beside a clean napkin.** 叉子和湯匙放在一張乾淨的餐巾紙旁邊。
11. **The children enjoy their meal together.** 小朋友一起享用餐點。

討論重點：Wrapper 與 Scene 4 的 Paper Wrapper 都是食物包裝紙，差別放在使用前後狀態。既有單字 wrapper 若已有包裝義可重用；是否另建 paper wrapper 詞條依使用者指定原清單保留處理。不要把它們解釋成不同材質或不同功能。

## Scene 4：After the Meal! 🧹／用餐結束後

活動：整理餐桌、分類餐後物品、歸還托盤與準備離開。一位小朋友在大人陪同下將剩餘飲料倒進專用液體收集口，另一位依圖像分類餐後物品，大人在旁歸還托盤；店員在側邊擦桌與整理清潔工具，背景顧客正從出口離開。畫面保留前景托盤上的剩餘食物與空杯子。分類僅示範看圖像指示，未指定實際店面的回收規則。

| 目標詞 | 原指定意思 | 圖中線索 |
| --- | --- | --- |
| Trash Can | 垃圾桶 | 具有一般垃圾圖示的桶 |
| Recycling Bin | 資源回收桶 | 有回收圖示且與垃圾桶不同的桶 |
| Tray Return Station | 餐盤回收區 | 托盤堆疊架與分類設備整體 |
| Leftovers | 剩餘食物 | 托盤上少量未吃完的餐點 |
| Empty Cup | 空杯子 | 打開且看得見空內部的杯子 |
| Paper Wrapper | 食物包裝紙 | 使用後攤皺的包裝紙 |
| Used Napkin | 使用過的餐巾紙 | 皺起且有少量食物痕跡的餐巾紙 |
| Cleaning Cloth | 清潔抹布 | 店員擦桌用的抹布 |
| Broom | 掃把 | 清潔推車旁的掃把 |
| Dustpan | 畚箕 | 與掃把分開可見的畚箕 |
| Mop | 拖把 | 清潔推車旁的拖把 |
| Cleaning Cart | 清潔推車 | 店員旁邊承裝工具的小推車 |
| Trash Bag | 垃圾袋 | 推車旁紮好的垃圾袋 |
| floor | 地板 | 小朋友腳邊與清潔推車之間清楚可見的磁磚地板 |
| Exit Sign | 出口指示牌 | 出口上方的圖像式逃生指示牌 |

新增形容詞與動詞（各 5 個）：

| 詞性 | English | 本次意思 | 圖中線索 |
| --- | --- | --- | --- |
| adj | empty | 空的 | 看得見空內部的杯子 |
| adj | dirty | 髒的 | 使用過的餐巾紙與未擦拭桌面 |
| adj | clean | 乾淨的 | 擦拭桌面的遠端已經乾淨 |
| adj | wet | 濕的 | 清潔抹布有少量水滴 |
| adj | messy | 凌亂的 | 餐後桌面上散落的包裝紙與餐具 |
| v | pour | 倒 | 孩子將剩餘飲料倒進專用收集口 |
| v | sort | 分類 | 另一位孩子依圖像分放餐後物品 |
| v | return | 歸還 | 陪同大人把托盤放回回收架 |
| v | wipe | 擦拭 | 店員用抹布擦桌 |
| v | leave | 離開 | 背景顧客走出出口 |

味覺／觸感／新鮮程度採圖像線索配合故事說明，不把靜態圖片當成直接證明。動作分配給不同人物，背景人物只支援本場活動。

故事定稿（25 詞版，離線 GUID／完整片語映射已完成）：

1. **The meal is over, and the children help tidy up.** 用餐結束了，小朋友幫忙整理。
2. **There are some leftovers, a paper wrapper, and a dirty used napkin on the tray.** 托盤上有一些剩餘食物、食物包裝紙和一張用過而且弄髒的餐巾紙。
3. **With an adult nearby, one child pours the remaining drink into a special hole.** 大人在旁邊陪同，一位小朋友將剩餘飲料倒進專用收集孔。
4. **An empty cup stands on the tray.** 一個空杯子放在托盤上。
5. **There is nothing inside the cup; it is empty.** 杯子裡沒有東西；它是空的。
6. **The other child helps sort the used items by checking the pictures above the bins.** 另一位小朋友查看桶子上方的圖像指示，幫忙將用過的物品分類。
7. **The trash can is beside the recycling bin.** 垃圾桶在資源回收桶旁邊。
8. **The children stand on the floor beside the bins.** 小朋友站在桶子旁邊的地板上。
9. **The adult returns a tray to the rack at the tray return station.** 大人把托盤放回餐盤回收區的架子上。
10. **Nearby, an employee wipes a table with a wet cleaning cloth.** 附近一位店員用濕的清潔抹布擦桌子。
11. **The far end of the table is already clean.** 桌子的遠端已經乾淨了。
12. **A broom, a dustpan, and a mop are beside the cleaning cart.** 掃把、畚箕和拖把放在清潔推車旁邊。
13. **A trash bag rests beside the cart, away from the messy table.** 一個垃圾袋放在推車旁，與凌亂的桌面保持距離。
14. **Near the exit sign, other customers leave the restaurant.** 在出口指示牌附近，其他顧客正離開餐廳。
15. **Soon, the children will be ready to leave, too.** 小朋友也很快就準備好離開了。

討論重點：Exit 與 Exit Sign 指向門／門上的指示牌；Recycling Bin 保留；依使用者修正，Recycling Symbol 在 r2 改為 floor（地板），避免兩個目標詞過於相近。清潔工具屬店員，不要求小朋友拿拖把或處理垃圾袋。

## r1 素材與字庫匯入結果（歷史紀錄）

- 四張底圖皆用 Codex imagegen skill 的 built-in image_gen 產生並保存於 `output/imagegen/`；第一場選 base-v1，其餘三場選 base-v2。第二場補蒸氣、第三場補清楚生菜綠葉、第四場分類物改為與圖示相符的乾淨紙袋；原圖保留未覆寫，四場匯入皆採已選定 hash。
- 匯入前原名詞 60 項中 27 項找到既有詞條、33 項缺詞；加 4 種服務模式後，104 個不同目標為 67 既有＋37 新增。40 補詞皆重用既有 GUID。盤點 JSON 的 missing／planned 數值表示當時狀態，現在 37 新詞已入庫、待新增 0。
- 37 新詞各 3 英文解釋與 3 中英例句（111 解釋＋111 例句）已正式寫入；source id 9176–9212，穩定 GUID 沿用備料。31 多字／連字號新詞分類 Others；French fries／trash can 原 GUID 合併 Others。Tray 保留原 GUID，中文擴充一般托盤／餐盤義並保留茶盤義，canonical 來源同步完成。
- 本輪 canonical source 由 9,166 增為 9,203 詞；寫入前來源備份：`data/scenario-preparation/mcdonalds-restaurant/canonical-source-before-draft-import.json`。`canonical-source-change.json` 是同步來源時的快照，內含當時尚未正式 DB 寫入與 Tray proposal 狀態；不以該歷史欄位代替後續正式結果。
- crispy、soft、dip、pour、sort、wipe、messy 保留 expert；新詞無可靠分級依據皆 null。Others 是分類而非詞性或分級，指定詞情境契約保留真實資料。
- 四場共 53 句、507 個完整 UTF-16 span、38 個多 token 詞組，全部目標涵蓋；正式 preflight 核對 204 個必要 GUID（167 既有＋37 當時待新增）。四場正式 check／匯入／單場 postcheck 均通過，故事所需 GUID 已齊備。
- 423 段新目標詞音與 4 份故事旁白共 427 個 MP3 全部完整解碼，文字 hash／bytes／SHA-256 核對通過，已複製至正式 volume 並匯入對應 metadata；335 段有效舊音重用。完整人工發音與內容試聽仍待做，解碼與操作成功不代表音質驗收完成。
- 使用者本輪「請繼續」明確授權正式 draft 匯入與所需字庫、音檔及服務更新；本批未授權發布。

## r1 首次正式 draft 匯入與服務更新（歷史快照）

| 場次 | 指定版本 | 目標／詞性 | 正式狀態 |
| --- | --- | --- | --- |
| 認識麥當勞餐廳 | [mcdonalds-restaurant-tour / r1](https://e-learning.jos.homes/#/scenarios/mcdonalds-restaurant-tour/revisions/1) | 29；17 n／7 adj／5 v | draft，餐廳標籤 24，未發布 |
| 一起點餐吧！ | [mcdonalds-order-food / r1](https://e-learning.jos.homes/#/scenarios/mcdonalds-order-food/revisions/1) | 25；15 n／5 adj／5 v | draft，餐廳標籤 24，未發布 |
| 一起享用美食！ | [mcdonalds-enjoy-meal / r1](https://e-learning.jos.homes/#/scenarios/mcdonalds-enjoy-meal/revisions/1) | 25；15 n／5 adj／5 v | draft，餐廳標籤 24，未發布 |
| 用餐結束後 | [mcdonalds-after-meal / r1](https://e-learning.jos.homes/#/scenarios/mcdonalds-after-meal/revisions/1) | 25；15 n／5 adj／5 v | draft，餐廳標籤 24，未發布 |

- 實際正式庫為 `english_learning`，查核伺服器 `172.18.0.4/32:5432`；所需 migrations 已存在，本輪未套 migration。查核證據：`data/scenario-preparation/mcdonalds-restaurant/production-preflight.json`。
- 備份 `data/scenario-import-backups/mcdonalds-restaurant-20261012/20261012-011810/verification.json` 記錄 DB dump／audio／images 完整解析與 bytes／SHA-256 全部通過；未做隔離還原演練，沒有刪除 retention 備份。
- 每場依 check → copy-audio → audio-metadata → scenario → postcheck 執行且全部通過；紀錄在 `data/scenario-preparation/mcdonalds-restaurant/import-<scenarioKey>/` 各五份 `.log`。四份底圖與旁白已正式匯入，revision 1 為 draft、publishedRevision 為 null；全批跨資料保留查核另行紀錄，不由單場 postcheck 推定完成。
- api／web-learner 已使用 `docker compose up -d --no-deps --wait` 更新且健康，正式指定詞／29 詞／Unicode 片語可使用；沒有跑 migration 或付費生成。Studio 選詞介面仍使用其原有分級流程，本批離線匯入不代表 Studio 已有完整指定詞製作支援。

## r1 首次匯入時的驗證與未解事項（歷史快照）

- `LC_ALL=zh_TW.UTF-8 npm test`：652 項通過；`npm run typecheck` 通過，適配器另 10 項測試通過。完整測試只使用 5433 的受保護 `english_learning_test`，未用正式庫清表，未呼叫真實 LLM／TTS。證據：`data/scenario-preparation/mcdonalds-restaurant/verification/draft-import-results.json`。最初語系排序與其後 canonical 筆數測試失敗原因保留原驗證紀錄；修正筆數預期為 9,203，仍保留欄位 roundtrip、重匯及 basic 1,193 檢查。
- 靜態座標量測：1440／1024／768 桌機平板與 390 手機放大零相交／越界；原 CSS 近似預覽及 file:// policy 阻擋為生成階段紀錄。後續已透過正式 HTTPS 指定版本完成實際 Chrome 操作，未採替代路徑繞過 policy。
- 正式 Chrome 桌機：104 張目標詞卡逐一開啟並成功載入；四場看圖回想初始皆 0 標籤，全部揭曉為 29／25／25／25，故事 gate 可用。四場故事旁白開始／暫停採抽查。
- 第一場完整 À la carte 故事片語開卡成功；播放單字音使故事暫停，保留位置並顯示「繼續旁白」。第三場 Tray 新中文詞義顯示成功；第四場翻譯切換及 Escape 關卡成功。
- 正式 Chrome 390px 手機：四場放大、開詞卡與返回均成功。證據：`data/scenario-preparation/mcdonalds-restaurant/browser-qa.json`。這些指定操作不代表所有箭頭、每組解釋／例句音、全面角色權限或發音品質已驗收。
- 尚待完整人工試聽與最終品質／角色驗收；目前 **qualityReadyToPublish=false、published=false**，不得以 checker 的 publishReady 或成功 draft 匯入代替品質可發布。一般情境清單只顯示 published，這四場仍須管理者開啟指定 revision。

## 素材預覽與歷史證據

[四場底圖與旁白總預覽](generated-review.html) 目前保留前三場 r1 素材／已發布連結，第四場改為 r2 故事／旁白／詞表與正式版本連結。原 r1 套件與匯入紀錄位於 `docs/scenarios/packages/mcdonalds-*-r1/`，第四場新版位於 `docs/scenarios/packages/mcdonalds-after-meal-r2/`。`generation-texts.json` 是故事備料，沒有完整匯入契約，仍不能當成 scenario package。

[image-prompts.json](image-prompts.json) 保存提示詞與選圖路徑；[獨立生成讀回報告](final-readback.md) 是正式匯入前的生成驗收快照，104 目標、507 spans、四尺寸座標與全部 423 新詞音等檢查保留。正式後續狀態以本文件、批次總表與正式匯入／Chrome 證據為準。

## r1 首次全局匯入後核對（歷史快照）

2026-10-12 全局唯讀 postcheck 通過：四場 revision 1 維持 draft／發布指標 null，204 個相關 GUID 與 canonical 一致，758 段目標詞音 metadata／文字 hash／bytes／檔案 hash 有效；四份 API detail 與八個 HTTP 媒體的 hash 通過。所有既有 revision hash、發布指標及 17 個 migration 紀錄與匯入前基準相同；一般情境清單隱藏 draft。證據：`data/scenario-preparation/mcdonalds-restaurant/production-postcheck.json`。此結果不代表人工完整試聽、learner 角色端到端或品質可發布。

## 第四場 r2 換詞修訂

r2 匯入當時狀態：前三場 r1 已發布；第四場 r2 為草稿，管理者由指定版本入口驗收。此節保存當時查核；最新已發布狀態另見下節。

使用者要求將 Recycling Symbol 換成其他詞；改為 floor（地板），使用既有 basic A1 名詞 GUID，四場最新目標仍為 104 個不同詞。保留 25 詞及 15 n／5 adj／5 v；底圖沿用，故事第 s7 句、翻譯、詞卡與互動位置同步。只用本機 Serena 新生成 78.216 秒完整英文旁白，184 段目標詞音均重用，沒有新增字庫或詞音 metadata。原第四場 r1 保留。

正式單場 check → scenario → postcheck 通過；全域唯讀 postcheck 的既有版本、發布指標、migrations、tags、9,203 詞及 9,515 列音 metadata hash 皆與本輪 before-state 相同。API／媒體 HTTP200且 hash 符合；第四場 r2 draft、publishedRevision null、餐廳 tag24。查核期間前三場由外部發布，before-state 與追加 DB 備份已記錄該狀態，本 agent 保留並未操作發布。

正式 Chrome 的 25 詞卡、floor 圖片及故事詞卡、單字音啟動、故事旁白開始／暫停、回想 0→25 及 390px 手機放大／詞卡／返回通過。未做人耳完整試聽，本輪為教材內容修訂、未改程式或部署，因此使用套件／正式匯入／UI檢查；上次 652 項測試與 typecheck 為前次程式改動的驗證。

[第四場 r2 正式草稿](https://e-learning.jos.homes/#/scenarios/mcdonalds-after-meal/revisions/2) · [本次匯入紀錄](../../packages/mcdonalds-after-meal-r2/import-review.md)。證據：`data/scenario-preparation/mcdonalds-restaurant/after-meal-r2-postcheck.json`、`data/scenario-preparation/mcdonalds-restaurant/after-meal-r2-browser-qa.json`。

## 使用者確認與最終現況

使用者確認「好，匯入吧」後，唯讀查核確認所有四場都已在正式一般清單中發布；第四場現行為 r2，包含 floor，Recycling Symbol 已移出最新目標詞。此輪未重複匯入、未操作發布、未部署或重新生成。一般 Chrome 入口可見新版底圖及 floor 詞卡，證據 `data/scenario-preparation/mcdonalds-restaurant/acceptance-final-state.json` 與同目錄 `after-meal-r2-published.png`。先前 draft/null／隱藏清單 postcheck 是各次匯入當時的歷史狀態。

提交前重跑：npm test 652 項、typecheck、套件工具14項、旁白工具8項與匯入適配器5項皆通過；測試只使用5433受保護測試庫與假client。完整人工試聽與全面角色驗收仍未完成，不以已發布狀態推定品質驗收。

[開啟第四場目前已發布版本](https://e-learning.jos.homes/#/scenarios/mcdonalds-after-meal)
