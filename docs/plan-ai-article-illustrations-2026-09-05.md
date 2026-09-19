# AI 文章插圖實作計畫

分支：`feat/ai-article-illustrations`。需求基線：`design-ai-article-illustrations-2026-09-05.md`。

## 交付範圍與分析

本次依第 7.3 節實作 Phase 1，Q1–Q7 暫採建議預設（已於對話提出供使用者調整）：人工核准後整版發布、每段保留 slot 並可略過、0–3 個人工定位單字、角色參考圖核准關卡、獨立 Gemini planner、本機 images volume。不自動觸發新文章生圖。

現有翻譯／語音的 jobs 與 status 不可重用。圖片使用獨立資料表及 worker process。費用使用 USD micros，quote 綁定來源及設定快照；每次上游呼叫需先原子保留預算。無法確認結果的呼叫保留成本並標記 uncertain，不自動重送。圖片 URL 除登入驗證外，需檢查 published 關係，避免學習者猜到候選圖片路徑。

## 實作順序

1. 共用 schema、來源 hash、全文規劃／單字驗證、模型與價格 catalog。
2. 獨立 Run／Slot／Candidate／Asset／Attempt／Job／Quote／Audit 與 cleanup outbox migration。
3. 管理 API：模型、估價、版本、取消、重試、審核、發布與刪除；學習者 published DTO。
4. OpenAI／Gemini adapters、全文 planner、獨立 worker、預算 reservation、uncertain 回收及儲存衍生圖。
5. 管理圖片區、人工座標與 alt 審核、學習者封面及 overlay fallback。
6. Compose、受保護圖片路由、備份還原與操作文件。
7. mock 單元／整合測試、全 workspace typecheck 與測試。

## 後續 Phase 2

parent 繼承式 missing／cover／paragraph scope、自動 vision／OCR QA、候選圖並排比較、Batch API、全站回補、pause／resume、style preset、R2／S3。資料模型預留繼承與多 Candidate 關係；首版 API 明確拒絕非 all scope。

## 驗證及部署邊界

自動測試只使用 mock provider 與 `_test` 資料庫，不讀正式 DATABASE_URL、不呼叫任何付費模型。migration 僅於測試庫驗證，正式 migration 與部署需另外確認。實際帳單可能不同於預算估算；未知費用不得显示成零。

## 官方介面核對（2026-09-06）

- [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2)：支援 `gpt-image-2-2026-04-21` snapshot。
- [OpenAI 圖片生成](https://developers.openai.com/api/docs/guides/image-generation)：generation 與帶 reference 的 edits API。
- [Gemini 3.1 Flash Lite Image](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image)：1K 圖片，保留原指定模型。
- [Gemini 價格](https://ai.google.dev/gemini-api/docs/pricing)：圖片與文字／thinking 分別計價。

## 交付與驗證紀錄

上述 Phase 1 實作已完成；包含模型可用性 heartbeat、來源與設定快照、獨立背景工作、角色參考圖審核、候選圖人工定位、整版發布、學習者 fallback 與檔案 cleanup outbox。實作與操作限制見 `ai-illustrations-operations.md`。

- `LC_ALL=zh_TW.UTF-8 npm test`：全 workspace 通過。原有 `web-admin/src/lib/meta.test.ts` 預期繁中排序，en-US 環境會有一項既有失敗；未為本功能改動該排序行為。
- `npm run typecheck`、`npm run build`：通過。
- 新增測試涵蓋 catalog／價格驗證、原文單字、兩個 provider mock、估價冪等與來源綁定、生成／審核／發布／取消、角色關卡、未知結果回收、併發預算限制、刪除 cleanup 與前端 fallback。
- 僅在 5433 的隔離 `_test` 資料庫套用 migration。未部署、未套正式 migration、未呼叫真實付費 API。
