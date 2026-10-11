# 情境製作文件獨立 read-back

檢查日期：2026-10-10。此輪只讀文件與原始碼，未執行測試、連線資料庫、啟動服務或呼叫真實 LLM／圖片／TTS API。報告為唯一新增檔案。

## 結論

主要流程一致：studio 路由限 admin、持久化工作／attempt／lease、生成個別手動啟動、模型入口與 Codex 生圖分開、API／worker 共用 studio volume、worker 複製媒體後匯入 draft、發布獨立進行。文件沒有將此次假 client 驗證宣稱為真實供應商測試。正式寫入、部署、發布均明列尚未執行或須另行確認。

仍需補清楚固定版本後的唯讀／fork、Node 模式環境設定與故事支援詞規則。其他問題為小範圍敘述精確度與任務路由完整性；不需要擴大實作範圍。日期與最終驗證證據由主 agent 更新。

## 精確差異與最小修正

1. **固定版本後製作草稿立即唯讀，不需等到發布。** `docs/scenarios/admin-studio.md:17` 只明說「發布版本保持完整快照，新內容另建版本」，容易讓人認為固定但未發布的草稿仍可修改。實作 `shared/src/scenarioStudio/repository.ts:21` 拒絕固定草稿更新；API `scenarioStudio.ts:38`、`:125` 拒絕生成與上傳；前端 `ScenarioStudio.tsx:249` 顯示唯讀與複製提示。最小修正：加入「固定為教材版本後，該製作草稿即為唯讀；要修改時按『複製成新草稿』，原版本保留。」

2. **fork 不保存原製作 Prompt／審閱狀態。** 文件沒有說明 fork 操作。API `scenarioStudio.ts:79–84` 由既有 revision 重建草稿，複製目標詞／座標、故事、底圖、旁白；`emptyStudioDraft` (`contracts.ts:34`) 使用目前預設圖片模型與風格、清空審閱；場景描述採原標題。最小修正：於唯讀說明後補「複製會帶入教材內容、位置及媒體，但圖片 Prompt／模型設定使用目前預設，審閱項目須重新確認。」若希望完全還原原 Prompt，現行 revision 沒有該資料，不能宣稱已支援。

3. **本機 Node 需明示兩個 studio 環境變數。** `admin-studio.md:45` 說本機改用 localhost 端點，但未明說必須設定 `SCENARIO_QWEN_TTS_URL`；`worker/src/scenario-index.ts:17–18` 在該值缺少時停用 speech，即使內部 provider 建立時有 localhost fallback。`api/src/server.ts:39–46` 只有 `SCENARIO_STUDIO_DIR` 存在才註冊 studio，API 同樣由 TTS 變數決定 availability；worker `scenario-index.ts:15` 直接要求 studio dir。最小修正：明說「本機 API 與 worker 均須設定 SCENARIO_STUDIO_DIR；啟用錄音時兩者亦須設定 SCENARIO_QWEN_TTS_URL=http://127.0.0.1:8000/v1/audio/speech。未設定不會自動啟用 TTS。」Compose 模式目前已有兩變數，文件預設 Docker 端點正確 (`docker-compose.yml:68–69`、`:141–142`)。

4. **故事支援詞『分級待決』與 studio 實際硬性驗證不同。** `scenario-learning-requirements.md:38` 保留「故事支援詞的完整分級篩選規則仍待決定」。目前 `shared/src/scenarioStudio/story.ts:44` 對每個英文 token 的字庫原型，超出草稿已選 basic／advance levels 即建立 blocking check；API `scenarioStudio.ts:51–52` 也只提供已選 levels 字典給模型。最小修正：保留已確認／待決事項的歷史區分，但補註「目前後台實作要求目標與支援詞的原型皆屬該草稿選定級別；超出級別會阻擋完成。」若此硬性限制尚未獲產品確認，應明列為實作限制，不能自行改寫成已確認決定。

5. **十五詞還必須至少包含名詞、動詞、形容詞各一個。** `admin-studio.md:9` 只說核對詞性；`story.ts:59` 明確要求 n／v／adj 各至少一詞，且為 blocking check。最小修正：選詞步驟加「十五詞需包含名詞、動詞、形容詞各至少一個」。

6. **16:9 處理只在生成結果，上传不會正規化。** `admin-studio.md:12` 同一句談生成／上傳後寫「圖片採 16:9」，可能被讀成所有圖片均自動轉換。生成 `providers.ts:101` 完整置入 1600×900 畫布；上傳 `storage.ts:27` 只驗格式／解碼與保存原尺寸。最小修正：改「生成圖片統一完整置入 1600×900（16:9）畫布；上傳保留原尺寸，建議先準備 16:9 底圖。」

7. **架構第 13 節缺 studio 任務入口。** `docs/codebase-architecture.md:478` 情境任務定位仍只列離線套件與 learner／import／scenarios API。第 2、4、API 表及部署節已介紹 studio，但依導覽第 13 節定位會漏掉新入口。最小修正：新增「情境製作後台、選詞、Prompt／故事生成、候選媒體、缺音、固定版本／fork」列，指向 `docs/scenarios/admin-studio.md`、`web-admin/src/ScenarioStudio.tsx`／`lib/scenarioStudio.ts`、`api/src/routes/scenarioStudio.ts`、`shared/src/scenarioStudio/`、`worker/src/scenario-index.ts` 與 studio migration／測試；實際 client 檔名須依當下檔案核對。

## 已核對一致的重點

- `#/scenarios/<scenarioKey>/revisions/<revision>` 與前端 `ScenarioStudio.tsx:332–334` 組網址一致。studio API 前綴 `/scenarios/studio` 與 `scenarioStudio.ts:22–23` 一致，所有 studio route 掛 `requireAdmin`。
- `npm run start:scenarios -w @el/worker` 與 `worker/package.json` 的 `start:scenarios` 一致。獨立 `scenarios` profile、指定 `scenario-worker` 的 Compose 指令、deploy.sh 僅預設 `images` (`scripts/deploy.sh:55`) 均一致。
- `studioMissingAudioPlan` (`story.ts:64–74`) 只查 `draft.targets` GUID，涵蓋目標詞的單字、全部非空解釋／例句，查文字 hash、metadata／實體檔案；finalize 全解碼驗證。文件與架構的「只补目標字庫缺少或失效音檔，沿用有效基本級錄音」正確。故事支援詞音檔不在此補音範圍，建議文件明說，避免把完整故事點字理解成補齊所有支援詞錄音。
- 故事使用既有文字模型選項；圖片使用 image catalog／既有 OpenAI、Google adapters；旁白固定 Qwen／Serena。瀏覽器不能輸入 TTS endpoint，固定 profile 來自 `contracts.ts:6`。
- API 正式 images volume 唯讀，studio volume 可寫；scenario-worker 正式 images/audio 可寫，符合 `docker-compose.yml:71–74`、`:145–149`。
- 生成工作完成只有草稿版本未變時套用 patch (`repository.ts:68–72`)；候選圖片／旁白保存為資產。finalize 仍匯入 draft，未自動發布 (`processor.ts` 的 `finalizeStudio`)。
- README、PRODUCT、需求及流程文件的「正式尚未部署／匯入／發布」沒有和 source 發生衝突；source 無法驗證實際正式運行狀態，報告僅確認敘述沒有混淆。

## 驗證邊界

沒有實跑測試或檢查正式 DB／容器；不為 source 一致性 read-back 補稱測試全綠或正式未部署的外部實證。README 架構服務表沒有 image-worker／scenario-worker 為原有簡表，新增 studio 功能段落已導向操作文件，屬可補但非阻擋項。

## 修補後 targeted read-back verdict

2026-10-10 再次限定覆核先前文件差異、最新 `verification.md` 及對应 source。**先前七項文件差異均已補清楚；本次範圍未發現新的文件／實作 blocking 不一致。前面列項保留作審查歷史，不代表目前仍待修。**

- `admin-studio.md` 已明說 n／v／adj 至少各一、固定教材版本後立即唯讀、fork 帶入故事／圖片／座標／旁白但重設 Prompt 預設與審閱；對應 `story.ts:59`、`repository.ts:25`、API `scenarioStudio.ts:79–84`、`:111`。
- 生成結果完整置入 1600×900；上傳保留原尺寸的敘述已分開，對應 `providers.ts:95`、`storage.ts:27`。
- Node 模式已說明 API 必須設定 `SCENARIO_STUDIO_DIR` 才註冊 studio routes；錄音必須明设 `SCENARIO_QWEN_TTS_URL`，未設停用，對應 `api/src/server.ts:39–45`、`worker/src/scenario-index.ts:15–24`。worker 同樣要求 studio directory；文件此前「須明示媒體目錄」及 Compose 專用變數段落沒有衝突。
- `scenario-learning-requirements.md:38` 已將後台故事目標／支援詞的原型級別限制寫成目前行為，對應 `story.ts:44`。此驗收只確認文件描述目前實作，沒有自行確認新的產品決定。
- `verification.md` 的實際限制明說只補十五個目標詞，支援詞缺音仍可待準備，對應 `studioMissingAudioPlan` 只以 `draft.targets` GUID 查詢 (`story.ts:65`)；架構導覽同樣說只補目標字庫音檔。
- 架構第 13 節已有 studio 文件／API／shared／worker／admin／migration 任務入口。README／PRODUCT 的新增說明保持手動生成、版本預覽與發布，以及正式尚未部署的邊界。
- 預覽 hash 路由、`/scenarios/studio` admin 路由、`start:scenarios` workspace 指令、獨立 `scenarios` profile、deploy.sh 預設僅 `images`、Compose Docker Qwen 預設端點再次核對一致。

### 最新驗證文件的敘述邊界

`verification.md` 明確區分一次全套 607 項（257＋140＋17＋104＋89＝607）與後續 API 16、shared 24、admin 37 的針對最後修正驗證，沒有稱後續再次全套通過。假生成 client／測試庫瀏覽器操作與既有素材播放分開，不宣稱呼叫真實模型、圖片 API 或本機 TTS；正式 migration、metadata／素材匯入、部署、worker 啟用與發布仍列未執行。

原三項安全 findings 已由 `code-review.md` 最後限定 verdict 註明在原重現及晚到故事接回範圍 closed；`verification.md` 用「限定覆核修復」引用該結論，沒有放大成全庫安全認證。程式／DB 中斷時 finalize 不具跨交易原子提交的已知限定仍保留在原 reviewer 文件。

本次依要求沒有跑測試、連資料庫或啟服務，也沒有重新產生 QA 證據；對 `verification.md` 的檢查是範圍與文字一致性檢查，執行通過與瀏覽器數據來自 root 的實際驗證紀錄。本次沒有補稱獨立實跑。
