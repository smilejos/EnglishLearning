# 四個旅遊情境：離線詞文備料

## 結論

- 沿用已審圖片所對應的現有故事，不為變更而重寫；33句中英文字已完成103個目標詞次覆蓋。
- 4場共355個英文tokens，透過完整片語映射組成346筆wordLinks。共用scenarioStoryTokens／validateScenarioWordLinkSpans逐句驗證全通。
- 真正缺詞僅baggage cart、business class、economy class，沒有額外故事支援詞缺口。三詞共9英文解釋＋9中英例句，字庫parser驗證通過。
- 渡輪仍採default-graded，所有目標及支援lemma均符合basic＋advance；其餘三場user-specified保留真實expert／null。
- 全部為離線計畫：未改canonical、未讀寫DB／volume、未產音／生圖、未匯入／發布。

## 輸出

- `texts.json`：根scenes陣列，每場targets（含entryStatus標記）、sentences（含id/en/zh/wordLinks）、textEn/textZh、paragraphBreakAfterSentenceIds及mappingStatus。製作strict package時需移除entryStatus等計畫欄位，補座標等契約內容。
- `wordbank-additions.json`：僅三筆新增詞條的`{ entries: [...] }`離線增量。
- `merged-vocabulary.json`：canonical 9,244詞＋3計畫新詞，共9,247詞，僅供離線checker與備料；不要把整份合併來源當成本次正式字庫增量匯入。
- `lexical-review.json`：使用詞條、手動屈折alias、適用場景與計畫GUID狀態；無unresolved項。
- `prepare.py`、`map-texts.mjs`：tmp內可重跑工具；後者直接重用Repo tokenizer/span驗證器與Wordbank parser。

## 新詞識別與正式前置查核

| 詞條 | 計畫source id | 穩定計畫GUID | 狀態 |
| --- | --- | --- | --- |
| baggage cart | 9254 | 3b5cef7a-9d6d-5a47-acd5-3fcd25a05283 | 待正式占用查核／未入庫 |
| business class | 9255 | ab98d6ac-e941-5978-b758-cc69b760cf87 | 待正式占用查核／未入庫 |
| economy class | 9256 | debdd36d-d229-531b-a5e5-efd7517fa4a9 | 待正式占用查核／未入庫 |

canonical SHA-256：`158cc627f2a62a5fb0c81cd33f33c7d360665c0df4917c87d39b49bb82e2d6d6`。離線max source id為9253；9254–9256只核對本機來源未占用，正式DB尚未查。

GUID以既有namespace `5aa9fb1e-a703-519e-83a1-290af6e0b8e4` 與固定 `scenario:travel-scenarios-proposal` 前綴產生UUID v5；子項依種類／單字／文字穩定生成。來源未改變時可重跑沿用。若正式DB已存在同字，須重用實際GUID並重新綁定，不可盲寫計畫GUID。

## 每場統計

| 場景key | 模式 | 目標詞次 | 句數 | 映射狀態 |
| --- | --- | --- | --- | --- |
| travel-airport-gate | user-specified | 26 | 8 | 完整覆蓋，無未解項 |
| travel-hotel-check-in | user-specified | 29 | 9 | 完整覆蓋，無未解項 |
| travel-ferry-trip | default-graded | 19 | 6 | 完整覆蓋，無未解項 |
| travel-airplane-cabin | user-specified | 29 | 10 | 完整覆蓋，無未解項 |

## 語義與格式注意

- 多字片語保持完整canonical表面字形：A baggage cart、business class、economy class、One flight attendant、Guests check in等，不使用checks in／flight attendants等片語屈折。
- 單字屈折明確映回原型，例如carries→carry、suitcases→suitcase、is/are→be、gives→give。所有alias已保存在lexical-review。
- 無縮寫與所有格apostrophe；既有引號是標點，未被誤當token。索引由Repo JS tokenizer產生，為UTF-16 offset。
- texts的isTarget按同場entryGuid判斷；同詞出現多次均正確標記，支援詞不會誤標目標。
- canonical既有非空定義／分級均保留。新詞CEFR／tw_7000／list沒有分級依據，全部null。
- 圖像線索與物品內容仍需父回合套件／UI驗收；本子任務未重新做圖片審閱或音訊聽審。

## 證據與驗證

- `shared/src/wordbank.ts:8`：詞條schema及新詞最低欄位；`:34`起parseWordbankDocument可解析增量與合併來源。
- `shared/src/scenario-word-links.mjs:2`：共用tokenizer；`:9`起完整片語／span驗證器。
- `shared/src/scenarios.ts:27`：wordLink契約；`:55`起故事span與目標覆蓋驗證。
- 現有故事來源：`docs/scenarios/preparation/travel-scenarios-proposal/batch.json`的四場storyDraft；原始圖片選擇為機場v2，其餘v1。
- 實跑：`node --import tsx /tmp/travel-vocabulary-prep/map-texts.mjs`，回報issues=[]；新詞及合併來源已經parseWordbankDocument驗證。
- 尚未做scenario完整package check／dry-run：需由父回合加座標、媒體、音訊／缺件狀態；不得以本詞文結果宣稱publishReady。
