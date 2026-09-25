# AI 文章插圖操作

## 啟用

1. 先備份。確認正式 migration 後部署本分支。
2. 在 `.env` 設定 `GEMINI_API_KEY`（planner 及 Google 圖片）及 `OPENAI_API_KEY`（只注入 image-worker）。也支援 worker 的 `OPENAI_API_KEY_FILE`，使用時另以 Compose override 掛載 secret file。
3. `config/image-models.json` 及 `config/image-pricing.json` 為唯讀掛載。若只使用一個 provider，停用其他 entry 並調整 defaultModelId。enabled provider 缺憑證時 worker 拒絕啟動。
4. 執行 `./scripts/deploy.sh rebuild`，完整部署會自動包含 image-worker；若只要建置並啟動圖片服務，執行 `./scripts/deploy.sh up image-worker`。worker 不會替文章自動生圖，只執行管理員確認過的工作。
5. 管理端已完成文章的「文章 AI 圖片」選模型 → 估價 → 確認 → 生成 → 人工核准 → 發布。

API 透過 worker 最近 60 秒的 heartbeat 及模型設定 hash 顯示可用模型，毋需取得 OpenAI key。設定変更後重啟 API 與 image-worker；排隊中版本使用已保存的快照。只有 models/pricing JSON 及 worker snapshot 包含非敏感能力資料。

## 價格與重試

費用以 USD micros 儲存。報價含一次 planner、封面、每段圖片、最多一張角色參考圖及重試預留；未使用項目不呼叫 API。單價與驗證日期保存於 pricing JSON。OpenAI 的 outputTokens 是保守 reservation allowance（8192），不是官方保證的特定尺寸 token 數；API usage 可解析時記錄按單價計算的費用，否則保留估計。實際帳單可能不同於估價；上限控制後續請求的預留，無法約束供應商最終計費。

逾時／斷線與重啟後可能已送出的請求標記 `uncertain`，保留預算，不自動重送。人工重試必須確認可能重複計費。429／5xx 以退避排程最多三次，每次留下 attempt；無法確定未收費時仍保留預算。Planner 結果無效時不生成圖片。

## 人工審核

故事角色先生成參考圖，核准後才排送封面／段落。每張圖要確認兒童安全、內容與角色一致性、alt text 及教學物件。標示僅允許原文 token，每段最多三個，人工點擊圖片或輸入 0–1 座標。核准後才可發布整套。

Phase 1 僅接受完整 `all` scope。可在未發布版本重試候選圖、略過失敗段落；換模型要建立新完整版本。已核准角色參考圖在正文生成後不可修改。Planner 略過但沒有 scene 的段落，可由管理者恢復：使用原段落與原計畫的畫風／角色建立場景，並保存此人工覆核決定。

## 儲存、刪除及回復

API `/images/` 要求應用層驗證，學習者只能下載目前發布版本引用的圖。API host port 僅綁 loopback；正式設定 `DEV_AUTH_BYPASS=0`，入口維持 Cloudflare Access。

`scripts/backup.sh` 包含 `images.tgz`；README 提供還原指令。舊版本不自動清除；目前發布版本不能刪除。刪除候選圖最後一個引用時透過 DB trigger 建立 cleanup job，worker 可重試刪除檔案。取消先等待處理中的請求完成再刪版本。worker 未啟動時 cleanup 留在 DB，不會遺失。

自動測試一律使用 mock，不生成任何真實圖片。正式上游 smoke test 需另行明確授權低預算測試文章。
