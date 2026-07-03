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

## 備份與還原

備份內容：PostgreSQL 全庫（`pg_dump --format=custom`）＋ audio volume（tar.gz）。
**備份檔含使用者 email，請存放於私人空間；異地備份建議先加密（age/gpg）。**

```bash
# 手動備份（預設到 ~/EnglishLearningBackups，保留最近 7 份）
./scripts/backup.sh
# 指定目的地與保留份數
BACKUP_DIR=/Volumes/NAS/elb BACKUP_KEEP=14 ./scripts/backup.sh
```

### 還原

```bash
# 1) 還原資料庫（覆蓋現有資料，操作前務必確認！）
docker compose up -d db
docker compose exec -T db pg_restore -U app -d english_learning \
  --clean --if-exists --no-owner < /path/to/backup/db.dump

# 2) 還原音檔到 audio volume
tar -xzf /path/to/backup/audio.tgz -C /tmp
docker compose cp /tmp/audio/. api:/data/audio
rm -rf /tmp/audio

# 3) 重啟服務
./scripts/deploy.sh restart
```

### 每日自動備份（macOS launchd）

存成 `~/Library/LaunchAgents/com.englishlearning.backup.plist` 後
`launchctl load ~/Library/LaunchAgents/com.englishlearning.backup.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.englishlearning.backup</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd 〈repo 絕對路徑〉 && ./scripts/backup.sh >> /tmp/el-backup.log 2>&1</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
</dict></plist>
```

## 上線前檢查清單（正式對外前逐項確認）

1. `.env` 中 `DEV_AUTH_BYPASS=0`（api 會強制要求 CF_ACCESS_* 設定，缺少即啟動失敗）。
2. `CF_ACCESS_TEAM_DOMAIN` 與 `CF_ACCESS_AUD` 已填；前後台網域都在 Cloudflare Access 政策內。
3. `ADMIN_EMAILS` 只含真正的管理者。
4. **對外流量一律經 Cloudflare Tunnel／Access**；不要把 8080/8081/8082 直接 port-forward 上網
   （`/audio/` 與 `/healthz` 在 app 層為免驗證路徑，設計上依賴邊緣驗證）。
5. db 埠僅綁 127.0.0.1（本 repo 預設如此）；不需本機直連時可整段移除 ports。
6. 每日備份已排程（見「備份與還原」），且做過一次還原演練。
7. `POSTGRES_PASSWORD` 已改掉預設值 `app`。

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
