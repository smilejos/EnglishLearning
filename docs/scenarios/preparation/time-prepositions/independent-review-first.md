# 時間介系詞兩組圖解教材：fresh-context 唯讀驗收

驗收日：2026-11-07。範圍是本次離線教材、關鍵程式與文件 read-back，沒有驗收正式環境。工作樹含其他 phonics 改動，本次不將那些改動算入介系詞批次。

## 結論

教材文字／圖片、字庫目標與新增資料、guide 契約與一般模式隔離的關鍵檢查通過；發現 **1 項中度程式缺陷（P2）**，會阻擋本批隔離預覽。不能宣稱整體驗收完成。音檔與目前 review 更新均仍屬進行中，沒有把尚未產完的聲音或尚未更新的進度當作「完成卻錯誤」。

## 確定缺陷

### P2：隔離預覽將 `contentReview` 傳入 strict content schema，兩份套件都無法解析

- 位置：`scripts/scenarios/preview-time-prepositions.ts:34`、`:35`。
- 原因：只從套件排除 `assets`、`generationPlan`、`status`，其餘全部交給 `ScenarioContentSchema.parse(input)`。本批套件另有 `contentReview`；契約在 `shared/src/scenarios.ts:39` 使用 `.strict()`，不接受該欄位。
- 資料證據：`docs/scenarios/packages/time-prepositions-basics-r1/scenario.json:1458`、`docs/scenarios/packages/time-prepositions-extended-r1/scenario.json:1619`。
- 實際重現：以 `TSX_DISABLE_CACHE=1 node --import tsx --input-type=module` 在記憶體讀取兩份真實 JSON，執行預覽工具相同的 destructure 與 `safeParse`；兩份皆回傳 `success:false`，錯誤為 `Unrecognized key(s) in object: 'contentReview'`。此重現完全沒有建立 DB pool、寫檔、啟動服務或呼叫 TTS。
- 影響：音檔補齊後仍會在匯入測試庫前失敗，無法啟動 API 或取得可用的本批預覽。基礎組目前已附音檔，故依現有遍歷順序即可遇到該問題。
- 建議：共用 `scripts/import-scenario.ts:24` 的 `contentFromScenarioPackage` 明確挑選 content 欄位；它對兩份本批真實 JSON 的解析已在本次唯讀檢查通過。不要放寬 strict schema 來容納備料 metadata。補一個使用真實套件且保留 `contentReview` 的純轉換回歸案例。

## 已獨立確認

1. 已讀磁碟 `AGENTS.md`、架構第 1–3 節與第 13 節、派工與判準文件。這個環境沒有可用的 subagent 委派工具；本次是相對於製作者的新 context，沒有宣稱另找第二位驗收者複核本報告。
2. 已實際檢視兩張 `*landscape-v2.png`，都是使用者指定的 1672×941 橫圖。兩份套件 referenceImage／baseImage 使用對應原檔，實際 SHA-256 一致，`containsVocabularyText:true` 且 `learningMode:'illustrated-guide'`。
3. 第一組完整涵蓋 in winter、in autumn、2024、April、一般早／午／晚、Monday、December 25、my birthday、Monday morning、下午五點、早上七點、noon、midnight、night，以及 this morning、next Monday、last year、every day 四個不用介系詞的表達。圖的 a.m.／p.m. 改寫成完整英文時段，數字 2024／25 保留，沒有偽造數字 GUID。
4. 第二組 before／after、from／to、by／until、for／since／during、in／within 的圖文概念正確。since 使用 `I have been here since Monday.`；by 表最晚完成、until 表持續到終點；for 表長度、since 表起點、during 表事件期間；in two hours 表兩小時後，within 表最晚兩小時內並允許提早。中英文逐句對讀相符。
5. 目標是 3＋11 個 prep，共 13 個不同 GUID。真實 canonical 詞性與 list 一致；within 是 expert，其餘目標為 basic。兩篇各 19 句，共 149＋151＝300 個字母 token，獨立用 Python regex 逐一核對 surface／起訖／GUID／字庫 word 與屈折形，全部通過，沒有漏字或同義字偽映射。全文與句子串接另由現行 checker 及 shared schema 驗過。
6. 直接比對 Git HEAD 與目前 canonical 的 13 個既有目標詞：原欄位（id、GUID、definition、parts_of_speech、level、category、scenario 等）全保留；原 explains／examples 內容全保留，每詞恰好各追加 1 筆，且位於尾端，共 26 子項。autumn 與增量內容相同，id 9253、三欄 null、3 explain／3 中英例句，UUIDv5 以指定 namespace／name 獨立重算一致。全來源 9,244 詞；本批增量共 14 詞條、16 explain／16 examples。
7. `node scripts/scenarios/prepare-time-prepositions.mjs --check` 實跑成功，未追加資料、未寫檔。兩份 `valid:true`；執行時基礎組有旁白所以 `publishReady:true`，擴充組缺旁白所以 `publishReady:false`。此旗標僅代表離線素材 gate，不等於正式可發布。
8. 已在記憶體以既有客廳真實套件確認匯入轉換省略 learningMode 時不新增該 key，canonical JSON 與 revision hash 都相同。prep 移除 guide 模式後確實被 schema 拒絕。`scripts/check-scenario-package.mjs:141` 把含字標記與模式對等核對，普通模式仍要求 false。
9. 前台程式 `web-learner/src/ScenarioLearning.tsx:142`、`:163`、`:217` 使圖解不採回想且不渲染回想切換；清單僅 guide 增加 prep 計數，原情境仍保留 n／adj／v。新增 tests 涵蓋 guide 查卡／旁白、一般回想→guide→一般及 key／revision 切換；API／shared tests 涵蓋模式、詞性與舊格式。此次只審閱測試，沒有重跑 DB tests 或全 suite。
10. 音檔工具的缺 opt-in guard 與 endpoint guard 已用純記憶體呼叫確認：缺 `SCENARIO_REAL_TTS=1` 於讀檔前拒絕；非 HTTP、非 loopback、帶 query 的 endpoint 被拒絕。靜態追蹤 `scripts/scenarios/prepare-time-prepositions-audio.mjs:119`、`:165`、`:169`、`:188`：重用時核對 metadata／實檔，使用 COPYFILE_EXCL，既有不同輸出及未驗證缺音輸出皆拒絕覆寫；未執行複製或生成。備料工具 `prepare-time-prepositions.mjs:246` 依故事與實檔 hash 保留既有旁白，且本次 --check 已通過目前附音的基礎組。

## 文件 read-back 與待補

- requirements、import-criteria、generation-import-workflow、architecture 對 optional guide、真實 prep、含字圖與禁用回想的規則一致，並清楚保留一般模式／Studio 原流程與未正式匯入／未部署邊界。
- 已檢查本批 review、兩份 import-review、requirements／criteria／workflow 中本機 Markdown 連結，全部存在；review 列出的備料／checker／字庫 dry-run 指令對應實際 script 與 package.json。
- **文件待補，非已完成錯誤**：`docs/scenarios/generation-import-workflow.md:11` 說本機 Serena 與 `_test` 預覽指令見 review，但目前 `docs/scenarios/preparation/time-prepositions/review.md:38` 只列備料、checker 與字庫 dry-run；沒有新音檔工具／preview 的完整命令、opt-in 或 learner 的 `VITE_API_PROXY=http://127.0.0.1:5180` 與 5181 啟動方式。主對話完成產音與修復預覽後應補齊，並明確標註 preview 會寫 `_test`，不要和純唯讀 --check 混用。
- review／verification／idempotence 等仍記錄產音前狀態，依委派指示列為後續更新，不以目前缺件或過期 hash 判不合格。
- 13 目標與新詞本次已獨立比對；全庫「除本批外均未變」仍需製作前完整快照才能獨立重驗。既有 `source-merge-verification.json` 宣稱通過，但未附可供本次重新比較的原始快照位置，故不將那份聲明當成獨立證明。

## 尚待驗收／明確未做

- 擴充組新旁白、全部目標詞音最終 manifest、解碼與 hash 對帳；所有新聲音的完整人工發音聽審，尤其日期、數字與文法詞。
- 預覽缺陷修復後的桌機／手機完整畫面、標籤遮擋、放大、全部目標查卡、故事翻譯、播放／仲裁／離頁、一般情境回想回歸及角色權限實跑。
- 全 suite 與 typecheck 由主對話驗證；本次沒有引用其尚未完成的結果當作已通過。
- 未連正式或測試 DB，未跑 DB tests／migration／匯入／seed／發布／部署，未使用 LLM／TTS／圖片生成服務，未覆寫原音、未修改 repo 任何檔案。唯一寫入是本 `/tmp` 報告。

## 修復後複驗（2026-11-07，主對話進行 browser QA 前）

- **原 P2 已確認修復**：`scripts/scenarios/preview-time-prepositions.ts:13` 匯入正式共用轉換，`:35` 實際使用；兩份真實套件（含 contentReview）成功轉換，learningMode／prep 保留，contentReview 不進入 content。
- MJS 動態匯入移至 main（:18、:20）。實跑 `TSX_DISABLE_CACHE=1 node --import tsx scripts/scenarios/preview-time-prepositions.ts`，按預期只回報「須指定兩套本批套件」並退出；沒有 top-level await／CJS 載入錯誤，沒有走到 DB 建立。
- `TSX_DISABLE_CACHE=1 node --import tsx --test scripts/import-scenario.test.ts`：1/1 通過，純讀檔與記憶體測試，未連 DB。
- 以唯讀記憶體程式重走預覽工具 pool 建立前的完整主要 preflight：兩套 valid／publishReady 均 true；3＋11／13 唯一目標、全部故事引用、共用 content 轉換、profile、manifest 契約、123 個必要音訊皆通過。額外核對全部 123 個目標音實檔 bytes 與 SHA-256，均符合 raw manifest。
- `audio-verification.json` 確有 125 筆，全部記錄正時長／位元組數及高於門檻的有限 peakDbfs；兩份旁白證據為 89.976／80.136 秒。此次讀取既有解碼／近靜音證據，沒有重跑完整解碼或人工聽審；90 重用／33 補產沿用主對話製作紀錄，未獨立重做來源分類。
- **目前未發現新的離線啟動前阻擋**。DB 匯入／服務 listen／實際 API 與 browser QA 留主對話執行，不能以本次 preflight 推定那些步驟通過。文件待更新項目保留到下一輪 read-back。
- 本次無 DB 操作、無服務啟動、無生成與 repo 修改；僅追加本報告。
