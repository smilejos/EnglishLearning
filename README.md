# 英文知識學習平台

從無打造的英文學習平台。後台上傳英文文章 → 逐段產生繁中翻譯與中英語音；前台閱讀／聆聽，點擊單字查詢「帶文章脈絡、全站共享、跨文章累積」的中英解釋與例句。

- 設計：`design-english-learning-platform-2026-06-29.md`
- 計畫：`plan-english-learning-platform-2026-06-29.md`

> 目前處於 **Phase 0 — 基礎設施骨架**：每個服務只有最小可執行內容，目的在於先確認所有 Docker image 能 build 且容器能正常起來。業務邏輯尚未實作。

## 架構（Docker Compose）

| 服務 | 內容 | 對外埠（預設） |
|------|------|------|
| `db` | PostgreSQL 16（`pgdata` volume） | 5432 |
| `api` | Fastify（目前只有 `/healthz`），掛載共用 `audio` volume | 8080 |
| `worker` | 背景處理（目前為 heartbeat + DB 連線檢查），掛載同一 `audio` volume | — |
| `web-admin` | React + Vite（nginx 靜態服務） | 8081 |
| `web-learner` | React + Vite（nginx 靜態服務） | 8082 |

`api` 與 `worker` 共用同一個 `audio` named volume。

## 在 Mac Mini 上啟動與驗證（Apple Silicon / arm64）

```bash
cp .env.example .env        # 視需要調整埠號 / 密碼

# 1) build 所有 image
docker compose build

# 2) 啟動
docker compose up -d

# 3) 檢查狀態（db / api 應為 healthy）
docker compose ps

# 4) 逐項驗證
curl localhost:8080/healthz                 # → {"ok":true,"service":"api"}
docker compose logs worker | tail           # → 應每 5 秒一筆 heartbeat，且 "db ok"
open http://localhost:8081                   # web-admin 首頁
open http://localhost:8082                   # web-learner 首頁

# 5) 驗證 api 與 worker 共用同一 audio volume
docker compose exec worker sh -c 'echo hi > /data/audio/ping.txt'
docker compose exec api cat /data/audio/ping.txt   # → hi

# 收尾
docker compose down          # 加 -v 連同 volume 一併清除
```

全部通過代表 Phase 0 完成，可進入 Phase 1（`shared` 資料契約）。

## 本機開發（不經 Docker）

```bash
npm install
npm run typecheck            # 全工作區 tsc --noEmit
API_PORT=8080 npm run start --workspace @el/api
npm run dev --workspace @el/web-learner
```
