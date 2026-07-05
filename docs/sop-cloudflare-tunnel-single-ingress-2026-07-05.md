# SOP：以 Cloudflare Tunnel + Access 對外發布前台／後台（單一入口）

> 目的：讓 `web-learner`（前台）與 `web-admin`（後台）在**家用 Mac Mini 零對外 port** 的情況下對外服務，
> 並在後台子網域套用**白名單 Gmail** 存取控制。
> 方案：Cloudflare Tunnel（cloudflared，outbound 連線）+ Cloudflare Access（邊緣身分驗證）。
> 建立日期：2026-07-05

> **⚠ 2026-07-05 更新：改為「單一網域＋路徑分流」。**
> 原規劃的兩個子網域中，後台若為**兩層子網域**（如 `admin.e-learning.example.com`）
> 會超出 Cloudflare Universal SSL 憑證涵蓋範圍（只涵蓋一層 `*.example.com`），TLS 握手直接失敗。
> 現行做法：對外只掛**一個**一層子網域，由 repo 新增的 `proxy` 服務（nginx）用路徑分流 —
> `/admin/*` → `web-admin`（SPA 以 `/admin/` 為 base 打包）、API 路徑 → `api`、其餘 → `web-learner`。
> Tunnel 的 Public Hostname 只需一條，指向 `http://proxy:80`；Access 以「網域＋路徑 `/admin`」保護後台。
> 下文子網域相關段落以更新後的表格與範例為準。

---

## 0. 背景與原則

- 兩個前端映像、nginx、`api`、`worker` **全部維持不動**；本 SOP 只是「在最前面加一層對外入口」。
- `api` **不對外**；前端 nginx 內部反代 `/articles`、`/words`、`/audio`… 到 `api:8080` 的邏輯照舊。
- Cloudflare 邊緣驗證後注入的 `Cf-Access-Jwt-Assertion` 會一路穿過 cloudflared → nginx → api，
  沿用現有 `CF_ACCESS_AUD` / `CF_ACCESS_TEAM_DOMAIN` / `ADMIN_EMAILS` 的 JWT 驗證鏈。
- Tunnel 是 Mac Mini **主動 outbound** 連到 Cloudflare，家用路由器**不需開任何 port、不需 port forwarding**。
- 路由（ingress）與 Access 政策皆採 **Dashboard 託管（Token 模式）**，repo 只多一個容器與一個 `.env` 變數。

> 以下以 `admin.example.com`（後台）、`learn.example.com`（前台）為例，實作時請替換成你的網域。

---

## 1. 前置需求（Prerequisites）

- [ ] 一個網域已加入 Cloudflare（Nameserver 已指向 Cloudflare、狀態 Active）。
- [ ] Cloudflare 帳號已啟用 **Zero Trust**（免費方案即可）。
- [ ] Mac Mini 已可正常 `docker compose up -d` 跑起現有服務。
- [ ] 你要放行的 Gmail 清單（後台白名單）。

---

## 2. 程式碼異動（一次性，進 repo）

### 2.1 在 `docker-compose.yml` 新增 `cloudflared` 服務

放進 `tunnel` profile（與現有 `seed` profile 同套路，本機開發不受影響）：

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    profiles: ["tunnel"]
    command: tunnel run
    restart: unless-stopped
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - web-admin
      - web-learner
```

### 2.2 調整前後台互連網址（build args）

正式機的前後台互連按鈕要指向正式子網域。於 `.env`（正式機）設定：

```dotenv
# 前後台互連（build 時注入 SPA；單一網域＋路徑分流）
ADMIN_URL_PUBLIC=learn.example.com/admin
LEARNER_URL_PUBLIC=learn.example.com

# 關閉本機用的驗證繞道（正式機務必為 0）
DEV_AUTH_BYPASS=0

# Cloudflare Tunnel Token（見第 3 步取得；敏感值，勿進 repo）
CLOUDFLARE_TUNNEL_TOKEN=<在步驟 3 取得>
```

> `docker-compose.yml` 既有的 `VITE_ADMIN_URL: ${ADMIN_URL_PUBLIC:-...}`、
> `VITE_LEARNER_URL: ${LEARNER_URL_PUBLIC:-...}` 會自動吃到這些值。
> 改了互連網址後前端需**重新 build**（見第 4 步）。

### 2.3 確認 `.env` 不進版控

`.env` 應已列於 `.gitignore`；`CLOUDFLARE_TUNNEL_TOKEN` 只放 `.env`，切勿提交。
可將上述新增鍵補到 `.env.example`（**留空值**）作為文件。

---

## 3. Cloudflare 後台一次性設定（Dashboard）

> 位置：Cloudflare Dashboard → **Zero Trust** → 左側選單。

### 3.1 建立 Tunnel 並取得 Token

1. **Networks → Tunnels → Create a tunnel**。
2. 類型選 **Cloudflared**，命名（如 `english-learning`）。
3. 建立後畫面會顯示安裝指令，其中 `--token` 後面那串就是 **Tunnel Token**。
   複製它 → 貼到正式機 `.env` 的 `CLOUDFLARE_TUNNEL_TOKEN`。
   （我們不用它給的安裝指令，容器會用這個 Token 自己連。）

### 3.2 設定 Public Hostname（ingress 路由）

在同一個 Tunnel 的 **Public Hostname** 分頁，只需**一條**（單一網域＋路徑分流）：

| Subdomain | Domain | Service（Type / URL） |
|---|---|---|
| `learn` | `example.com` | `HTTP` / `proxy:80` |

> - Service URL 直接填容器服務名 `proxy:80`（cloudflared 與 proxy 在同一 docker network）；
>   由 proxy 依路徑分流到 `web-admin` / `web-learner` / `api`。
> - **Subdomain 只能一層**（`learn.example.com` 可以、`admin.learn.example.com` 不行）——
>   Universal SSL 憑證只涵蓋一層萬用子網域，兩層會 TLS 握手失敗。
> - Type 用 `HTTP`（proxy nginx 聽 80，非 TLS；對外 TLS 由 Cloudflare 邊緣負責）。
> - DNS 的 CNAME 會由 Cloudflare 自動建立，不需手動加。

### 3.3 建立 Access Application（後台白名單）

1. **Access → Applications → Add an application → Self-hosted**。
2. Application name：`English Learning Admin`。
3. Application domain：`learn.example.com`、Path：`admin`（**以路徑只綁後台**）。
4. **Policies** 新增一條：
   - Action：`Allow`
   - Rule：`Emails` → 填入你的白名單 Gmail（可多個）。
5. 儲存。
6. 前台（`learn.example.com` 根路徑）要不要保護另建一個 Application 決定，互不影響。

> 若之後要讓前台也需登入，再為 `learn.example.com`（不填 Path）建一個 Application 即可。

---

## 4. 部署（正式機 Mac Mini）

```bash
# 1. 取得最新程式碼與 .env（含 CLOUDFLARE_TUNNEL_TOKEN、正式子網域、DEV_AUTH_BYPASS=0）
git pull

# 2. 重新 build 前端（互連網址是 build 時注入，改了就要重建）
docker compose build web-admin web-learner

# 3. 啟動所有服務 + tunnel（--profile tunnel 才會帶起 cloudflared）
docker compose --profile tunnel up -d

# 4. 確認 cloudflared 已連上（看到 "Registered tunnel connection" 即成功）
docker compose logs -f cloudflared
```

> 日常若不動 tunnel，仍用 `docker compose --profile tunnel up -d` 一起帶起。
> 本機開發不加 `--profile tunnel`，cloudflared 不會啟動。

---

## 5. 驗證（Deploy 後必做）

- [ ] 瀏覽 `https://learn.example.com` → **直接**看到前台（不需登入）。
- [ ] 瀏覽 `https://admin.example.com` → 先被 Cloudflare 攔截、要求 Gmail 登入。
- [ ] 用**白名單內**的 Gmail 登入 → 成功進入後台。
- [ ] 用**白名單外**的信箱 → 被拒（確認白名單有效）。
- [ ] 後台操作會打 `/articles`、`/categories` 等 → 正常回應
      （代表 `Cf-Access-Jwt-Assertion` 有穿透到 `api`，這是唯一需留意會不會斷的環節）。
- [ ] 前台／後台互連按鈕點擊 → 正確跳轉到對方子網域（非 `localhost`）。
- [ ] `docker compose logs cloudflared` 無持續錯誤、連線維持。

---

## 6. 回滾（Rollback）

Tunnel 是「附加層」，回滾很單純：

```bash
# 只停掉對外入口，內部服務照跑
docker compose stop cloudflared
```

- 停掉 cloudflared 後，`admin/learn.example.com` 會 502／無法連線，但內部服務與資料完全不受影響。
- 要完全撤除：於 Cloudflare 後台刪除該 Tunnel 與 Access Application，並移除 `.env` 的 Token。

---

## 7. 疑難排解（Troubleshooting）

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| 子網域回 **502 Bad Gateway** | cloudflared 連得上，但接不到前端容器 | 確認 Public Hostname 的 Service 填 `web-admin:80` / `web-learner:80`；確認前端容器 healthy |
| 子網域**一直轉圈／無法連線** | cloudflared 沒起來或 Token 錯 | `docker compose logs cloudflared`；檢查 `.env` 的 `CLOUDFLARE_TUNNEL_TOKEN` |
| 後台登入後打 API 得 **401/403** | JWT 沒穿透或 `DEV_AUTH_BYPASS` 設錯 | 確認正式機 `DEV_AUTH_BYPASS=0`、`CF_ACCESS_AUD`/`CF_ACCESS_TEAM_DOMAIN`/`ADMIN_EMAILS` 正確 |
| 後台**不用登入就進得去** | Access Application 沒綁對 domain | 確認 Application domain 為 `admin.example.com` 且政策為 Allow→Emails |
| 互連按鈕跳到 **localhost** | 前端沒用正式網址重 build | 設好 `ADMIN_URL_PUBLIC`/`LEARNER_URL_PUBLIC` 後 `docker compose build web-admin web-learner` |
| 白名單外信箱**也進得去** | 政策 Action 設成 Bypass 或規則過寬 | 檢查 Access Policy：Action=Allow、Rule=Emails 精確清單 |

---

## 8. 日常維運備忘

- **新增／移除白名單 Gmail**：Cloudflare 後台改 Access Policy 即可，**不需重部署**。
- **改路由目標**：Cloudflare 後台改 Public Hostname 即可，**不需重部署**。
- **cloudflared 升級**：`docker compose pull cloudflared && docker compose --profile tunnel up -d cloudflared`。
- **Token 外洩**：後台刪除該 Tunnel 重建、換新 Token、更新 `.env` 後重啟 cloudflared。
