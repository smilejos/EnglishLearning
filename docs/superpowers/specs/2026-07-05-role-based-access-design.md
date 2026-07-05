# 角色權限管理（RBAC）設計

- 日期：2026-07-05
- 狀態：已核准，待實作
- 相關：Cloudflare Access／Tunnel 單一入口（見 `docs/sop-cloudflare-tunnel-single-ingress-2026-07-05.md`）

## 背景與目標

正式機已串接 Cloudflare Access，`api/src/auth.ts` 會驗證 `Cf-Access-Jwt-Assertion` JWT 並取得可信任的登入者 email。目前角色只有兩種（`admin` / `reader`），由環境變數 `ADMIN_EMAILS` 靜態決定，且即時單字翻譯對所有登入者開放。

本設計把權限模型升級為**三種角色**，並讓管理者能在後台指派角色（含預先輸入尚未登入過的 email）。

### 三種角色語意（固定）

| 角色 | 中文 | 能做什麼 |
| --- | --- | --- |
| `admin` | 管理者 | 全部功能（後台管理、上傳、刪除、重譯、使用者管理、即時單字翻譯…） |
| `reviewer` | 審稿者 | 使用者的所有能力 + **即時單字重新翻譯**（`POST /lookups`） |
| `reader` | 使用者 | 閱讀文章、播放音檔、使用**已建立好**的單字翻譯（唯讀端點） |

### 決策紀錄

- 採**方案 A**：角色→固定權限，用守衛函式落地；不做可設定的權限矩陣（YAGNI）。
- **管理者身分只由 `ADMIN_EMAILS`（env）決定**，後台無法指派或撤銷管理者。
- 審稿者／使用者角色存在 DB，由管理者在後台指派。
- 支援**預先輸入尚未登入過的 email** 指派角色。

## §1 資料模型與角色判定

### Enum

`user_role` 由 `('admin','reader')` 擴充為 `('admin','reader','reviewer')`。以一支 migration 執行 `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'reviewer'`。

### `users` 表

- 沿用既有 `email (UNIQUE)`、`role (default 'reader')`。
- 新增 `last_seen_at TIMESTAMPTZ NULL`：每次登入更新；`NULL` 代表「管理者預先指派、尚未登入過」。

### 核心原則：DB 只保管 `reviewer` / `reader`，`admin` 永遠由 env 即時計算，不寫進 DB

避免陷阱——若把 admin 存進 DB，當某人自 `ADMIN_EMAILS` 移除後，DB 仍殘留 admin。

### 登入流程（auth 中介層改寫）

1. 由 JWT（或 dev bypass）取得 email。
2. `ensureUser(email)`：
   - 不存在 → 以 `role='reader'` 建列，`last_seen_at=now()`。
   - 已存在 → **只更新 `last_seen_at`，不覆蓋 role**（取代目前 `upsertUser` 會覆蓋 role 的行為，這是支援「預先指派」的關鍵）。
3. 計算 **effective role**：`ADMIN_EMAILS` 命中 → `'admin'`，否則 → DB 的 `role`。掛到 `request.user.role`。

> 註：DB 的 `role` 欄位在受管理路徑下只會是 `reviewer` / `reader`；`admin` 僅存在於執行期計算出的 effective role。

## §2 後端授權與端點

### 授權守衛（`api/src/auth.ts`）

- 保留 `requireAdmin`（限 `admin`）。
- 新增 `requireReviewer`：`role === 'admin' || role === 'reviewer'` 才放行，否則 403。

### 既有端點套用

- `POST /lookups`（即時單字重新翻譯）：由「所有登入者可用」改掛 `requireReviewer`。reader 呼叫回 403；rate limit 不變。
- 其餘既有 `requireAdmin` 路由（上傳、刪除、段落重譯、backfill…）不變。
- 純讀取端點（文章、`GET /words/:word/explanations`、`/articles/:id/lookups`、`/audio/*`）維持所有登入者可用 → 對應 reader 的「閱讀＋播放＋用既有翻譯」。

### 新增使用者管理端點（新檔 `api/src/routes/users.ts`，全部掛 `requireAdmin`）

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/users` | 回清單：`{ id, email, role(effective), lastSeenAt, isEnvAdmin }`。env 管理者 `isEnvAdmin=true` 且不可編輯。 |
| `PUT` | `/users/:email/role` | body `{ role: 'reviewer' \| 'reader' }`。更新既有使用者角色；role 只能為此兩值；目標若在 `ADMIN_EMAILS` → 400。 |
| `POST` | `/users` | body `{ email, role: 'reviewer' \| 'reader' }`。預先指派：以 email upsert（`last_seen_at=NULL`）；已存在等同改角色。email 格式以 zod 驗，不合回 400；目標若在 `ADMIN_EMAILS` → 400（與 `PUT` 一致，管理者不歸後台管）。 |

### `shared/repo/users.ts` 對應

- 新增 `ensureUser`（登入用，不覆蓋 role）、`listUsers`、`setUserRole`、`preprovisionUser`。
- 登入路徑改用 `ensureUser`；`upsertUser` 原覆蓋 role 的語意不再用於登入。

### `shared/src/schemas.ts`

- `UserRoleSchema` 擴為 `z.enum(["admin","reader","reviewer"])`。
- 新增管理端點所需的 request schema（改角色／預先指派，角色僅允許 `reviewer` / `reader`）。

## §3 後台使用者管理頁（web-admin）

### 導覽

於 `web-admin/src/App.tsx` 新增「使用者管理」視圖，沿用既有視圖切換方式，一個入口連結。

### 畫面

- 使用者清單表格，欄位：**Email｜角色｜狀態（已登入時間 / 未登入過）｜操作**。
  - 角色欄：env 管理者 → 唯讀徽章「管理者（env）」；其餘 → 下拉「審稿者 / 使用者」，改選呼叫 `PUT /users/:email/role`。
  - 狀態欄：`lastSeenAt` 有值 → 顯示最近登入時間；`NULL` → 標「未登入過（預先指派）」。
- 上方「預先新增 email」表單：email + 角色 → `POST /users`，成功後刷新清單。

### 前端程式

- `web-admin/src/api.ts` 新增 `listUsers()`、`setUserRole(email, role)`、`preprovisionUser(email, role)`。
- `web-admin/src/types.ts` 新增 `User`、`UserRole` 型別。

### 防呆

- env 管理者列不可改（UI 禁用 + 後端擋，雙保險）。
- 改角色／新增後顯示成功／錯誤訊息，沿用現有 App 錯誤呈現風格。

### 刻意不做（YAGNI）

刪除使用者、搜尋／分頁、邀請信。清單規模小，先求夠用；日後需要再加。

## §4 前台 gating、錯誤處理與測試

### 前台 web-learner gating

- App 啟動呼叫既有 `GET /me` 取得 `role`（`web-learner/src/api.ts` 加 `getMe()`）。
- 即時單字翻譯的觸發 UI（重新翻譯按鈕／入口）只在 `role ∈ {admin, reviewer}` 顯示；reader 看不到此動作，但仍可看既有解釋、閱讀、播放音檔。
- **縱深防禦**：UI 被繞過時後端 `requireReviewer` 仍擋（403）；前端遇 403 顯示友善訊息（如「此功能限審稿者以上使用」）而非壞掉。

### 錯誤處理原則

- 無權限一律 403，訊息語意清楚（`reviewer only` / `admin only`）。
- 後台改角色目標若為 env 管理者 → 400 並說明原因。
- `POST /users` email 格式不合 → 400（zod 驗）。

### 測試（遵守 CLAUDE.md：不呼叫真實 LLM／TTS，跑獨立測試庫 `docker-compose.test.yml`）

- **auth 單元**：`requireReviewer` 對三種角色的放行／擋；effective role 計算（env admin 勝出、DB 不存 admin）。
- **`ensureUser` 整合（測試庫）**：登入不覆蓋既有 reviewer；新使用者預設 reader；預先指派後登入角色保留且 `last_seen_at` 由 NULL 變有值。
- **`users` 路由整合**：列出／改角色／預先指派；改到 env 管理者被擋（400）。
- **`lookups` 既有測試補一條**：reader 打 `POST /lookups` → 403（LLM 部分維持 mock，不產生費用）。

### 示範資料

不影響 `fixtures/seed/`。

## 影響檔案一覽

- `migrations/`：新增 enum + `last_seen_at` migration。
- `shared/src/schemas.ts`、`shared/src/repo/users.ts`。
- `api/src/auth.ts`（`requireReviewer`、登入改用 `ensureUser`、effective role）。
- `api/src/routes/users.ts`（新）、`api/src/routes/lookups.ts`（掛 `requireReviewer`）、`api/src/app.ts`（註冊 users 路由）。
- `web-admin/src/App.tsx`、`api.ts`、`types.ts`。
- `web-learner/src/api.ts`、`App.tsx`。
- 對應測試檔。
