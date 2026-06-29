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

日常啟動／部署用 `scripts/deploy.sh`（可重複執行）。它會自動：從 `.env.example`
建立 `.env`、確認 Docker daemon 已啟動、啟動後**等待所有服務變成 healthy** 才回報成功。

```bash
# 一鍵：build（如有需要）→ 啟動 → 等待全部 healthy → 顯示狀態
./scripts/deploy.sh up
```

### 子命令一覽

| 命令 | 用途 |
|------|------|
| `./scripts/deploy.sh up` | build（如有需要）並啟動，等待 healthy（**預設**，直接 `./scripts/deploy.sh` 亦可） |
| `./scripts/deploy.sh deploy` | 拉取 base image + 重建並啟動（正式部署用） |
| `./scripts/deploy.sh rebuild` | 強制 `--no-cache` 重建後啟動 |
| `./scripts/deploy.sh down` | 停止並移除容器（**保留** DB 資料 volume） |
| `./scripts/deploy.sh restart` | 重啟所有服務 |
| `./scripts/deploy.sh status` / `ps` | 顯示各服務狀態 |
| `./scripts/deploy.sh health` | 只檢查／等待 healthy |
| `./scripts/deploy.sh logs [svc]` | 跟看日誌（可指定服務名，如 `logs worker`） |
| `./scripts/deploy.sh clean` | 連同 volume 一併清除（**會清空 DB**，需輸入 `yes` 確認） |
| `./scripts/deploy.sh help` | 顯示用法 |

### 啟動後的逐項驗證

```bash
curl localhost:8080/healthz                 # → {"ok":true,"service":"api"}
./scripts/deploy.sh logs worker             # → 應每 5 秒一筆 heartbeat，且 "db ok"（Ctrl-C 離開）
open http://localhost:8081                   # web-admin 首頁
open http://localhost:8082                   # web-learner 首頁

# 驗證 api 與 worker 共用同一 audio volume
docker compose exec worker sh -c 'echo hi > /data/audio/ping.txt'
docker compose exec api cat /data/audio/ping.txt   # → hi
```

全部通過代表 Phase 0 完成，可進入 Phase 1（`shared` 資料契約）。

## 本機開發（不經 Docker）

```bash
npm install
npm run typecheck            # 全工作區 tsc --noEmit
API_PORT=8080 npm run start --workspace @el/api
npm run dev --workspace @el/web-learner
```
