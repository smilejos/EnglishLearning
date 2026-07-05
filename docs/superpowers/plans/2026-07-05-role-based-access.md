# 三角色權限管理（RBAC）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把權限模型從兩角色（admin/reader）升級為三角色（管理者／審稿者／使用者），管理者身分固定由 env 決定，審稿者／使用者由後台指派（含預先輸入未登入 email）。

**Architecture:** Cloudflare Access 已提供可信任 email。`admin` 永遠由 `ADMIN_EMAILS`（env）即時計算、不寫入 DB；DB 的 `users.role` 只保管 `reviewer`／`reader`。登入時 `ensureUser` 只更新 `last_seen_at`、不覆蓋角色。授權用守衛函式落地（`requireAdmin`／新增 `requireReviewer`）。

**Tech Stack:** TypeScript、Fastify、PostgreSQL 16、Zod、Vitest、React（web-admin／web-learner）。

## Global Constraints

- 所有對談與 commit 訊息使用**繁體中文**（見 `CLAUDE.md`）。
- **預設測試絕不呼叫真實 LLM／TTS**：LLM／TTS 一律用注入的假 client 或 mock `fetch`。
- 整合測試跑獨立測試庫 `docker-compose.test.yml`（5433／`english_learning_test`），連線取自 `DATABASE_URL`（預設 `postgres://app:app@localhost:5433/english_learning_test`）。
- DB 欄位 snake_case、DTO 對外 camelCase，repo 層負責映射。
- 管理者身分**只**由 `ADMIN_EMAILS` 決定，後台不可指派／撤銷管理者；email 比對一律 `toLowerCase()`。
- 每個任務結束都要 commit。

---

## 檔案結構

- `migrations/1786000000000_add-reviewer-role-last-seen.sql`（新）— enum 值 + `last_seen_at` 欄位。
- `shared/src/schemas.ts`（改）— `UserRoleSchema` 加 `reviewer`；新增管理用 request schema。
- `shared/src/repo/users.ts`（改）— `User` 加 `lastSeenAt`；新增 `ensureUser`／`listUsers`／`setUserRole`／`preprovisionUser`。
- `shared/src/repo/users.test.ts`（新）— repo 整合測試。
- `api/src/auth.ts`（改）— `resolveEffectiveRole`、`requireReviewer`、登入改用 `ensureUser`。
- `api/src/auth.test.ts`（改）— 更新既有測試 + 新增角色測試。
- `api/src/routes/users.ts`（新）— 使用者管理端點。
- `api/src/routes/users.test.ts`（新）— 端點整合測試。
- `api/src/app.ts`（改）— 註冊 users 路由（傳入 `adminEmails`）。
- `api/src/routes/lookups.ts`（改）— `POST /lookups` 掛 `requireReviewer`。
- `api/src/routes/lookups.test.ts`（改）— 修既有測試 + 新增 reader→403。
- `web-admin/src/{types,api}.ts`、`web-admin/src/App.tsx`（改）— 使用者管理頁。
- `web-learner/src/{types,api}.ts`、`web-learner/src/App.tsx`（改）— 依角色 gate 即時翻譯。

---

## Task 1：DB migration（新增 reviewer enum 值與 last_seen_at）

**Files:**
- Create: `migrations/1786000000000_add-reviewer-role-last-seen.sql`

**Interfaces:**
- Produces: `user_role` enum 多一個值 `'reviewer'`；`users` 表多欄位 `last_seen_at TIMESTAMPTZ`（可為 NULL）。

- [ ] **Step 1：寫 migration SQL**

沿用既有 migration 的 `-- Up Migration` / `-- Down Migration` 格式（見 `migrations/1785600000000_add-headword.sql`）。

```sql
-- Up Migration
-- 角色新增「審稿者」；users 新增 last_seen_at 以區分「已登入過」與「預先指派」。
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'reviewer';
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS last_seen_at;
-- 註：PostgreSQL 無法移除單一 enum 值，down 不還原 'reviewer'（殘留無害）。
```

- [ ] **Step 2：套用到測試庫並驗證**

Run:
```bash
docker compose -f docker-compose.test.yml up -d
DATABASE_URL=postgres://app:app@localhost:5433/english_learning_test npm run migrate up
DATABASE_URL=postgres://app:app@localhost:5433/english_learning_test \
  docker compose -f docker-compose.test.yml exec -T db \
  psql -U app -d english_learning_test -c "\d users" -c "SELECT enum_range(NULL::user_role);"
```
Expected: `users` 出現 `last_seen_at | timestamp with time zone`；enum_range 含 `reviewer`。

> 若 `npm run migrate` 指令名不同，請比對 `package.json` scripts 與 `Dockerfile.migrate` 的實際跑法後採相同方式套用到測試庫。

- [ ] **Step 3：Commit**

```bash
git add migrations/1786000000000_add-reviewer-role-last-seen.sql
git commit -m "DB：新增 reviewer 角色與 users.last_seen_at 欄位"
```

---

## Task 2：shared schemas（角色列舉與管理用 request schema）

**Files:**
- Modify: `shared/src/schemas.ts:20-21`
- Test: `shared/src/schemas.test.ts`

**Interfaces:**
- Produces:
  - `UserRoleSchema = z.enum(["admin","reader","reviewer"])`、`type UserRole`。
  - `ManageableRoleSchema = z.enum(["reviewer","reader"])`、`type ManageableRole`。
  - `SetUserRoleRequestSchema = z.object({ role: ManageableRoleSchema })`。
  - `PreprovisionUserRequestSchema = z.object({ email: z.string().email(), role: ManageableRoleSchema })`。

- [ ] **Step 1：寫失敗測試**

在 `shared/src/schemas.test.ts` 的 `UserRoleSchema` 既有測試附近新增：

```ts
import {
  UserRoleSchema,
  ManageableRoleSchema,
  PreprovisionUserRequestSchema,
} from "./schemas";

describe("UserRoleSchema（三角色）", () => {
  it("接受 admin／reader／reviewer", () => {
    for (const r of ["admin", "reader", "reviewer"]) {
      expect(UserRoleSchema.parse(r)).toBe(r);
    }
  });
});

describe("ManageableRoleSchema", () => {
  it("只接受 reviewer／reader，拒絕 admin", () => {
    expect(ManageableRoleSchema.parse("reviewer")).toBe("reviewer");
    expect(ManageableRoleSchema.safeParse("admin").success).toBe(false);
  });
});

describe("PreprovisionUserRequestSchema", () => {
  it("拒絕非法 email", () => {
    expect(
      PreprovisionUserRequestSchema.safeParse({ email: "x", role: "reviewer" })
        .success,
    ).toBe(false);
  });
  it("接受合法 email + reviewer", () => {
    const r = PreprovisionUserRequestSchema.parse({
      email: "a@b.com",
      role: "reviewer",
    });
    expect(r.email).toBe("a@b.com");
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -w @el/shared -- schemas`
Expected: FAIL（`ManageableRoleSchema` 未匯出等）。

- [ ] **Step 3：實作 schema**

把 `shared/src/schemas.ts` 第 20-21 行替換為：

```ts
/** 使用者角色：對應 DB `user_role`。 */
export const UserRoleSchema = z.enum(["admin", "reader", "reviewer"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** 後台可指派的角色（管理者身分只由 ADMIN_EMAILS 決定，不可經後台指派）。 */
export const ManageableRoleSchema = z.enum(["reviewer", "reader"]);
export type ManageableRole = z.infer<typeof ManageableRoleSchema>;

/** PUT /users/:email/role 的 body。 */
export const SetUserRoleRequestSchema = z.object({ role: ManageableRoleSchema });

/** POST /users（預先指派）的 body。 */
export const PreprovisionUserRequestSchema = z.object({
  email: z.string().email(),
  role: ManageableRoleSchema,
});
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -w @el/shared -- schemas`
Expected: PASS。

- [ ] **Step 5：Commit**

```bash
git add shared/src/schemas.ts shared/src/schemas.test.ts
git commit -m "shared：角色列舉加 reviewer，新增後台指派用 schema"
```

---

## Task 3：shared repo/users（ensureUser 與管理函式）

**Files:**
- Modify: `shared/src/repo/users.ts`
- Test: `shared/src/repo/users.test.ts`（新）

**Interfaces:**
- Consumes: Task 2 的 `ManageableRole`；`user_role` 含 reviewer（Task 1）。
- Produces:
  - `interface User { id; email; name; role: UserRole; createdAt; lastSeenAt: string | null }`
  - `ensureUser(db, email): Promise<User>` — 不存在建列（role 預設 reader、`last_seen_at=now()`）；存在只更新 `last_seen_at`，**不動 role**。
  - `listUsers(db): Promise<User[]>` — 依 email 排序全部。
  - `setUserRole(db, email, role: ManageableRole): Promise<User | null>` — 更新既有列角色；不存在回 null。
  - `preprovisionUser(db, email, role: ManageableRole): Promise<User>` — upsert，設角色；新列 `last_seen_at` 保持 NULL。

- [ ] **Step 1：寫失敗測試**

建立 `shared/src/repo/users.test.ts`（連線樣式比照 `shared/src/repo/repo.test.ts`）：

```ts
// users repo 整合測試：對測試庫驗證登入不覆蓋角色與後台指派。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createPool } from "../db";
import {
  ensureUser,
  listUsers,
  setUserRole,
  preprovisionUser,
  getUserByEmail,
} from "./users";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

let pool: ReturnType<typeof createPool>;

beforeAll(() => {
  pool = createPool(DATABASE_URL);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
});

describe("ensureUser", () => {
  it("新使用者預設 reader 且寫入 last_seen_at", async () => {
    const u = await ensureUser(pool, "new@example.com");
    expect(u.role).toBe("reader");
    expect(u.lastSeenAt).not.toBeNull();
  });

  it("登入不覆蓋既有角色（reviewer 保留），並更新 last_seen_at", async () => {
    await preprovisionUser(pool, "rev@example.com", "reviewer");
    const before = await getUserByEmail(pool, "rev@example.com");
    expect(before?.lastSeenAt).toBeNull(); // 預先指派、尚未登入

    const after = await ensureUser(pool, "rev@example.com");
    expect(after.role).toBe("reviewer"); // 角色未被覆蓋
    expect(after.lastSeenAt).not.toBeNull(); // 登入後有時間
  });
});

describe("setUserRole", () => {
  it("更新既有使用者角色", async () => {
    await ensureUser(pool, "u@example.com");
    const updated = await setUserRole(pool, "u@example.com", "reviewer");
    expect(updated?.role).toBe("reviewer");
  });
  it("不存在的 email 回 null", async () => {
    expect(await setUserRole(pool, "nobody@example.com", "reviewer")).toBeNull();
  });
});

describe("preprovisionUser / listUsers", () => {
  it("預先指派尚未登入者，清單可見且 lastSeenAt 為 null", async () => {
    await preprovisionUser(pool, "pre@example.com", "reviewer");
    const list = await listUsers(pool);
    const row = list.find((u) => u.email === "pre@example.com");
    expect(row?.role).toBe("reviewer");
    expect(row?.lastSeenAt).toBeNull();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -w @el/shared -- users`
Expected: FAIL（`ensureUser` 等未匯出）。

- [ ] **Step 3：實作 repo**

編輯 `shared/src/repo/users.ts`：`User` 介面加 `lastSeenAt`，`mapUser` 加映射，並新增四個函式。`upsertUser` 保留不動（不再用於登入）。

```ts
import type { UserRole, ManageableRole } from "../schemas";
import { type Queryable, toNum, toIso } from "./types";

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  lastSeenAt: string | null;
}

function mapUser(row: any): User {
  return {
    id: toNum(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: toIso(row.created_at),
    lastSeenAt: row.last_seen_at ? toIso(row.last_seen_at) : null,
  };
}

/** 登入用：不存在則建列（預設 reader），存在只更新 last_seen_at，不覆蓋角色。 */
export async function ensureUser(db: Queryable, email: string): Promise<User> {
  const res = await db.query(
    `INSERT INTO users (email, last_seen_at)
     VALUES ($1, now())
     ON CONFLICT (email) DO UPDATE SET last_seen_at = now()
     RETURNING *`,
    [email],
  );
  return mapUser(res.rows[0]);
}

/** 全部使用者，依 email 排序（後台清單用）。 */
export async function listUsers(db: Queryable): Promise<User[]> {
  const res = await db.query(`SELECT * FROM users ORDER BY email`);
  return res.rows.map(mapUser);
}

/** 更新既有使用者角色（僅 reviewer/reader）。不存在回 null。 */
export async function setUserRole(
  db: Queryable,
  email: string,
  role: ManageableRole,
): Promise<User | null> {
  const res = await db.query(
    `UPDATE users SET role = $2::user_role WHERE email = $1 RETURNING *`,
    [email, role],
  );
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

/** 預先指派：以 email upsert 並設角色；新列 last_seen_at 維持 NULL。 */
export async function preprovisionUser(
  db: Queryable,
  email: string,
  role: ManageableRole,
): Promise<User> {
  const res = await db.query(
    `INSERT INTO users (email, role)
     VALUES ($1, $2::user_role)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
     RETURNING *`,
    [email, role],
  );
  return mapUser(res.rows[0]);
}
```

保留既有 `upsertUser` 與 `getUserByEmail` 不變（`getUserByEmail` 的 `mapUser` 會自動帶出 `lastSeenAt`）。

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -w @el/shared -- users`
Expected: PASS。

同時確認既有 repo 測試不壞：
Run: `npm test -w @el/shared`
Expected: PASS（`upsertUser` 既有測試不受影響）。

- [ ] **Step 5：Commit**

```bash
git add shared/src/repo/users.ts shared/src/repo/users.test.ts
git commit -m "shared repo：新增 ensureUser／listUsers／setUserRole／preprovisionUser"
```

---

## Task 4：api auth（effective role 與 requireReviewer）

**Files:**
- Modify: `api/src/auth.ts`
- Test: `api/src/auth.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `ensureUser`。
- Produces:
  - `resolveEffectiveRole(email, adminEmails, dbRole): UserRole` — email 命中 `adminEmails`（lower）→ `admin`，否則回 `dbRole`。
  - `requireReviewer: preHandlerHookHandler` — `role === 'admin' || role === 'reviewer'` 才過，否則 403 `{ error: "reviewer only" }`。
  - 中介層改為：`ensureUser` → 以 `resolveEffectiveRole` 算角色掛 `request.user`。

- [ ] **Step 1：寫失敗測試**

在 `api/src/auth.test.ts` 新增。先確認匯入含新符號：

```ts
import {
  resolveEffectiveRole,
  requireReviewer,
} from "./auth";
```

單元測試：

```ts
describe("resolveEffectiveRole", () => {
  it("命中 ADMIN_EMAILS（不分大小寫）回 admin", () => {
    expect(
      resolveEffectiveRole("Owner@Example.com", ["owner@example.com"], "reader"),
    ).toBe("admin");
  });
  it("未命中則回 DB 角色", () => {
    expect(resolveEffectiveRole("rev@example.com", [], "reviewer")).toBe(
      "reviewer",
    );
    expect(resolveEffectiveRole("r@example.com", [], "reader")).toBe("reader");
  });
});
```

整合測試（沿用檔案既有 `signToken`／`buildApp`／`baseConfig`）：預先指派 reviewer 後登入，`GET /me` 回 reviewer 且不被 env 覆蓋：

```ts
it("DB 為 reviewer 的使用者登入後 /me 回 reviewer，且 last_seen_at 被更新", async () => {
  const { preprovisionUser, getUserByEmail } = await import("@el/shared");
  await preprovisionUser(pool, "rev@example.com", "reviewer");
  const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
  const token = await signToken({ email: "rev@example.com" });
  const res = await app.inject({
    method: "GET",
    url: "/me",
    headers: { "cf-access-jwt-assertion": token },
  });
  expect(res.json().user.role).toBe("reviewer");
  expect((await getUserByEmail(pool, "rev@example.com"))?.lastSeenAt).not.toBeNull();
});
```

> 註：若既有測試檔用到 `resolveRole`，一併改名為 `resolveEffectiveRole`（見 Step 3）。

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -w @el/api -- auth`
Expected: FAIL（`resolveEffectiveRole`／`requireReviewer` 未匯出）。

- [ ] **Step 3：實作 auth 變更**

編輯 `api/src/auth.ts`：

1. import 由 `upsertUser` 改為 `ensureUser`：
```ts
import { ensureUser, type Queryable, type UserRole } from "@el/shared";
```

2. 把 `resolveRole` 替換為 `resolveEffectiveRole`（第 29-32 行）：
```ts
/** effective role：email 命中允許清單則 admin（env 說了算），否則回 DB 角色。 */
export function resolveEffectiveRole(
  email: string,
  adminEmails: string[],
  dbRole: UserRole,
): UserRole {
  return adminEmails.includes(email.toLowerCase()) ? "admin" : dbRole;
}
```

3. 中介層設定 `request.user`（原第 121-123 行）改為：
```ts
    const dbUser = await ensureUser(opts.pool, email);
    const role = resolveEffectiveRole(email, config.adminEmails, dbUser.role);
    request.user = { id: dbUser.id, email: dbUser.email, role };
```

4. 在 `requireAdmin` 後新增 `requireReviewer`：
```ts
/** 路由層守衛：限 admin 或 reviewer（即時單字重新翻譯用）。 */
export const requireReviewer: preHandlerHookHandler = async (request, reply) => {
  const role = request.user?.role;
  if (role !== "admin" && role !== "reviewer") {
    return reply.code(403).send({ error: "reviewer only" });
  }
};
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -w @el/api -- auth`
Expected: PASS（含既有「允許清單內 → admin」「首次存取 → reader」等，因 `resolveEffectiveRole` 對新 reader 回 reader）。

- [ ] **Step 5：Commit**

```bash
git add api/src/auth.ts api/src/auth.test.ts
git commit -m "api auth：改用 ensureUser 算 effective role，新增 requireReviewer 守衛"
```

---

## Task 5：api 使用者管理端點

**Files:**
- Create: `api/src/routes/users.ts`
- Modify: `api/src/app.ts:55`（新增 `registerUserRoutes`）
- Test: `api/src/routes/users.test.ts`（新）

**Interfaces:**
- Consumes: Task 3 repo 函式；Task 2 schema；Task 4 `requireAdmin`。
- Produces: `registerUserRoutes(app, pool, adminEmails: string[]): void`，掛：
  - `GET /users` → `{ users: Array<{ id; email; role; lastSeenAt; isEnvAdmin }> }`（role 為 effective）。
  - `PUT /users/:email/role`（body `{ role }`）→ `{ user }`；目標在 adminEmails → 400；查無 → 404。
  - `POST /users`（body `{ email, role }`）→ `{ user }`；email 在 adminEmails → 400。

- [ ] **Step 1：寫失敗測試**

建立 `api/src/routes/users.test.ts`（樣式比照 `api/src/routes/lookups.test.ts`：`buildApp` + `app.inject`，`devAuthBypass:true`）：

```ts
// 使用者管理端點整合測試（對測試庫）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createPool, preprovisionUser } from "@el/shared";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

// dev 使用者 owner@example.com 命中 adminEmails → admin，可打管理端點。
const config: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "owner@example.com",
  adminEmails: ["owner@example.com"],
};

let pool: ReturnType<typeof createPool>;
beforeAll(() => {
  pool = createPool(DATABASE_URL);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
});

describe("使用者管理端點", () => {
  it("GET /users 列出使用者，env 管理者標記 isEnvAdmin", async () => {
    const app = buildApp({ config, pool });
    await preprovisionUser(pool, "rev@example.com", "reviewer");
    const res = await app.inject({ method: "GET", url: "/users" });
    expect(res.statusCode).toBe(200);
    const users = res.json().users as any[];
    const rev = users.find((u) => u.email === "rev@example.com");
    expect(rev.role).toBe("reviewer");
    expect(rev.isEnvAdmin).toBe(false);
    // 呼叫端 owner 登入後也會被 ensureUser 建立並標記 env admin。
    const owner = users.find((u) => u.email === "owner@example.com");
    expect(owner.isEnvAdmin).toBe(true);
    expect(owner.role).toBe("admin");
  });

  it("PUT /users/:email/role 改角色", async () => {
    const app = buildApp({ config, pool });
    await preprovisionUser(pool, "u@example.com", "reader");
    const res = await app.inject({
      method: "PUT",
      url: "/users/u@example.com/role",
      payload: { role: "reviewer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe("reviewer");
  });

  it("PUT 改到 env 管理者 → 400", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "PUT",
      url: "/users/owner@example.com/role",
      payload: { role: "reader" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT 對不存在使用者 → 404", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "PUT",
      url: "/users/ghost@example.com/role",
      payload: { role: "reviewer" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /users 預先指派", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "pre@example.com", role: "reviewer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.lastSeenAt).toBeNull();
  });

  it("POST email 在 adminEmails → 400", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "owner@example.com", role: "reviewer" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("非 admin 呼叫 → 403", async () => {
    const readerConfig: AuthConfig = { ...config, devUserEmail: "r@example.com", adminEmails: [] };
    const app = buildApp({ config: readerConfig, pool });
    const res = await app.inject({ method: "GET", url: "/users" });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -w @el/api -- routes/users`
Expected: FAIL（路由未註冊 → 404，或 `registerUserRoutes` 不存在）。

- [ ] **Step 3：實作路由**

建立 `api/src/routes/users.ts`：

```ts
// 使用者管理路由（全部限 admin）。列出／改角色／預先指派。
import type { FastifyInstance } from "fastify";
import {
  listUsers,
  setUserRole,
  preprovisionUser,
  SetUserRoleRequestSchema,
  PreprovisionUserRequestSchema,
  type DbPool,
} from "@el/shared";
import { requireAdmin } from "../auth";

export function registerUserRoutes(
  app: FastifyInstance,
  pool: DbPool,
  adminEmails: string[],
): void {
  const isEnvAdmin = (email: string) =>
    adminEmails.includes(email.toLowerCase());

  const toDto = (u: {
    id: number;
    email: string;
    role: string;
    lastSeenAt: string | null;
  }) => ({
    id: u.id,
    email: u.email,
    role: isEnvAdmin(u.email) ? "admin" : u.role,
    lastSeenAt: u.lastSeenAt,
    isEnvAdmin: isEnvAdmin(u.email),
  });

  app.get("/users", { preHandler: requireAdmin }, async () => {
    const users = await listUsers(pool);
    return { users: users.map(toDto) };
  });

  app.put(
    "/users/:email/role",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const email = decodeURIComponent((request.params as { email: string }).email);
      if (isEnvAdmin(email)) {
        return reply
          .code(400)
          .send({ error: "管理者身分由 ADMIN_EMAILS 決定，無法於後台變更" });
      }
      const parsed = SetUserRoleRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const user = await setUserRole(pool, email, parsed.data.role);
      if (!user) return reply.code(404).send({ error: "user not found" });
      return { user: toDto(user) };
    },
  );

  app.post("/users", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = PreprovisionUserRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }
    if (isEnvAdmin(parsed.data.email)) {
      return reply
        .code(400)
        .send({ error: "此 email 已是 env 管理者，無需指派" });
    }
    const user = await preprovisionUser(pool, parsed.data.email, parsed.data.role);
    return { user: toDto(user) };
  });
}
```

在 `api/src/app.ts` 匯入並註冊（第 9 行 import 區、第 55 行後）：
```ts
import { registerUserRoutes } from "./routes/users";
```
```ts
  registerUserRoutes(app, opts.pool, opts.config.adminEmails);
```

> 確認 `SetUserRoleRequestSchema`、`PreprovisionUserRequestSchema`、`listUsers`、`setUserRole`、`preprovisionUser` 皆由 `@el/shared` 匯出（Task 2／3 已透過 `shared/src/index.ts` 的 `export * from "./repo"` 與 schemas 匯出）。若 schemas 未被 index 匯出，於 `shared/src/index.ts` 補 `export * from "./schemas";`（多數專案已有）。

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -w @el/api -- routes/users`
Expected: PASS（7 條）。

- [ ] **Step 5：Commit**

```bash
git add api/src/routes/users.ts api/src/routes/users.test.ts api/src/app.ts
git commit -m "api：新增使用者管理端點（列出／改角色／預先指派），限 admin"
```

---

## Task 6：POST /lookups 掛 requireReviewer

**Files:**
- Modify: `api/src/routes/lookups.ts:191`
- Test: `api/src/routes/lookups.test.ts`

**Interfaces:**
- Consumes: Task 4 `requireReviewer`。
- Produces: `POST /lookups` 限 admin／reviewer；reader → 403。

- [ ] **Step 1：先修既有測試（避免加守衛後全紅）並新增 reader→403**

`api/src/routes/lookups.test.ts` 目前 `config.adminEmails: []`、`devUserEmail` 預設 reader，會被新守衛擋。將既有 happy-path 的 config 改為讓 dev 使用者成為 admin：

把該檔的 config 定義改為：
```ts
const config: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "owner@example.com",
  adminEmails: ["owner@example.com"], // dev 使用者視為 admin，通過 requireReviewer
};
```

並新增一條 reader→403（放在 `describe("POST /lookups…")` 內）：
```ts
it("reader 呼叫 POST /lookups → 403", async () => {
  const readerConfig: AuthConfig = {
    cfAccess: null,
    devAuthBypass: true,
    devUserEmail: "reader@example.com",
    adminEmails: [],
  };
  const app = buildApp({ config: readerConfig, pool, audioDir, lookupDeps: makeDeps() });
  const res = await app.inject({
    method: "POST",
    url: "/lookups",
    payload: { articleId, paragraphId, word: "habit" },
  });
  expect(res.statusCode).toBe(403);
});
```
> 若 `articleId`／`paragraphId`／`makeDeps`／`audioDir` 是在既有 `describe` 的 `beforeEach`／閉包內建立，將本測試放進同一 `describe` 以沿用它們。

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -w @el/api -- routes/lookups`
Expected: FAIL（reader→403 尚未成立，回 200/429 等）。

- [ ] **Step 3：實作守衛**

`api/src/routes/lookups.ts`：先於 import 區加入 `requireReviewer`（第 31 行既有 `import { requireAdmin } from "../auth";`）：
```ts
import { requireAdmin, requireReviewer } from "../auth";
```
把第 191 行 `POST /lookups` 註冊加上 preHandler：
```ts
  app.post("/lookups", { preHandler: requireReviewer }, async (request, reply) => {
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -w @el/api`
Expected: PASS（lookups 全綠，其餘 api 測試不受影響）。

- [ ] **Step 5：Commit**

```bash
git add api/src/routes/lookups.ts api/src/routes/lookups.test.ts
git commit -m "api：POST /lookups 限審稿者以上（requireReviewer）"
```

---

## Task 7：web-admin 使用者管理頁

**Files:**
- Modify: `web-admin/src/types.ts`、`web-admin/src/api.ts`、`web-admin/src/App.tsx`

**Interfaces:**
- Consumes: Task 5 端點。
- Produces: 新 view `"users"`；`UserManager` 元件；`api.listUsers()`／`setUserRole()`／`preprovisionUser()`。

- [ ] **Step 1：types 與 api 封裝**

在 `web-admin/src/types.ts` 新增：
```ts
export type ManageableRole = "reviewer" | "reader";

export interface AdminUser {
  id: number;
  email: string;
  role: "admin" | "reviewer" | "reader";
  lastSeenAt: string | null;
  isEnvAdmin: boolean;
}
```

在 `web-admin/src/api.ts` 末尾新增（沿用既有 `req<T>` 封裝）：
```ts
import type { AdminUser, ManageableRole } from "./types";

export function listUsers(): Promise<{ users: AdminUser[] }> {
  return req("/users");
}

export function setUserRole(
  email: string,
  role: ManageableRole,
): Promise<{ user: AdminUser }> {
  return req(`/users/${encodeURIComponent(email)}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export function preprovisionUser(
  email: string,
  role: ManageableRole,
): Promise<{ user: AdminUser }> {
  return req("/users", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}
```
> `types.ts` 若已有其他 `import type`，將 `AdminUser` 併入既有 import 行即可；`api.ts` 檔頭已 `import type { Article, ... } from "./types"`，把 `AdminUser, ManageableRole` 併入該行，不要重複 import。

- [ ] **Step 2：UserManager 元件**

在 `web-admin/src/App.tsx`（`WordManager` 之後、`type View` 之前）新增：
```tsx
function UserManager() {
  const [users, setUsers] = useState<api.AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<api.ManageableRole>("reviewer");

  const load = useCallback(async () => {
    try {
      setUsers((await api.listUsers()).users);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(email: string, role: api.ManageableRole) {
    try {
      await api.setUserRole(email, role);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.preprovisionUser(newEmail.trim(), newRole);
      setNewEmail("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="section-eyebrow" style={{ marginTop: 0 }}>
        使用者管理
      </div>
      <form onSubmit={addUser} style={{ display: "flex", gap: 8, margin: "10px 0 16px" }}>
        <input
          className="field"
          placeholder="預先新增 email…"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <select
          className="field"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as api.ManageableRole)}
        >
          <option value="reviewer">審稿者</option>
          <option value="reader">使用者</option>
        </select>
        <button className="btn btn--primary" type="submit">
          新增
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Email</th>
            <th style={{ textAlign: "left" }}>角色</th>
            <th style={{ textAlign: "left" }}>狀態</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>
                {u.isEnvAdmin ? (
                  <span className="brand__tag">管理者（env）</span>
                ) : (
                  <select
                    className="field"
                    value={u.role === "admin" ? "reader" : u.role}
                    onChange={(e) =>
                      void changeRole(u.email, e.target.value as api.ManageableRole)
                    }
                  >
                    <option value="reviewer">審稿者</option>
                    <option value="reader">使用者</option>
                  </select>
                )}
              </td>
              <td>
                {u.lastSeenAt
                  ? new Date(u.lastSeenAt).toLocaleString()
                  : "未登入過（預先指派）"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3：接上導覽**

在 `web-admin/src/App.tsx`：
1. `type View` 加 `"users"`：
```ts
type View = "list" | "new" | "detail" | "edit" | "taxonomy" | "words" | "users";
```
2. 於 `<nav className="topnav">` 內、「單字」按鈕之後加：
```tsx
            <button
              className={"topnav__btn" + (view === "users" ? " on" : "")}
              onClick={() => setView("users")}
            >
              使用者
            </button>
```
3. 於 `<main>` 的視圖分派加一支（在 `view === "words"` 分支旁）：
```tsx
        ) : view === "users" ? (
          <UserManager />
```

- [ ] **Step 4：typecheck 與 build 驗證**

Run: `npm run typecheck -w @el/web-admin && npm run build -w @el/web-admin`
Expected: 皆成功、無型別錯誤。

> web-admin 無元件級單元測試（沿用專案現況），此處以 typecheck + build 為驗證關卡。

- [ ] **Step 5：Commit**

```bash
git add web-admin/src/types.ts web-admin/src/api.ts web-admin/src/App.tsx
git commit -m "後台：新增使用者管理頁（清單／改角色／預先新增 email）"
```

---

## Task 8：web-learner 依角色 gate 即時翻譯

**Files:**
- Modify: `web-learner/src/api.ts`、`web-learner/src/App.tsx`

**Interfaces:**
- Consumes: 既有 `GET /me`（回 `{ user: { id, email, role } | null }`）；Task 6 的 403。
- Produces: `api.getMe()`；`canReexplain` 由 App → `Reader` → `WordPopup` 傳遞，控制「用本篇重新解釋」按鈕顯示與 403 友善訊息。

- [ ] **Step 1：api getMe**

在 `web-learner/src/api.ts` 新增：
```ts
export interface Me {
  id: number;
  email: string;
  role: "admin" | "reviewer" | "reader";
}

export function getMe(): Promise<{ user: Me | null }> {
  return req("/me");
}
```

- [ ] **Step 2：App 取角色並下傳**

在 `web-learner/src/App.tsx` 的 `export default function App()` 內，加入角色狀態：
```tsx
  const [canReexplain, setCanReexplain] = useState(false);
  useEffect(() => {
    void api.getMe().then((r) => {
      const role = r.user?.role;
      setCanReexplain(role === "admin" || role === "reviewer");
    });
  }, []);
```
把 `<Reader ... />` 呼叫加上 prop：
```tsx
        <Reader
          articleId={openId}
          onBack={() => navigate(null)}
          onJump={navigate}
          canReexplain={canReexplain}
        />
```

- [ ] **Step 3：Reader 透傳給 WordPopup**

`Reader` 元件簽章（第 350 行）加入 `canReexplain: boolean`：
```tsx
function Reader({
  articleId,
  onBack,
  onJump,
  canReexplain,
}: {
  articleId: number;
  onBack: () => void;
  onJump: (articleId: number) => void;
  canReexplain: boolean;
}) {
```
於 `<WordPopup ... />`（約第 588 行）加：
```tsx
          canReexplain={canReexplain}
```

- [ ] **Step 4：WordPopup 依角色隱藏按鈕、處理 403**

`WordPopup` 簽章（第 201 行的 props 型別）加入 `canReexplain: boolean`：
```tsx
  onExplained,
  canReexplain,
}: {
  word: string;
  articleId: number;
  paragraphId: number;
  onClose: () => void;
  onJump: (articleId: number) => void;
  onExplained?: () => void;
  canReexplain: boolean;
}) {
```
把「用本篇重新解釋」按鈕（約第 320-330 行的 `explanations.some(... ) ? ... : <button onClick={reexplain}>`）外層再包一層角色判斷——只有 `canReexplain` 才顯示按鈕；reader 顯示唯讀提示：
```tsx
        {!canReexplain ? (
          explanations.some((e) => e.articleId === articleId) ? (
            <p className="sheet__note">✓ 本篇已解釋</p>
          ) : null
        ) : explanations.some((e) => e.articleId === articleId) ? (
          <p className="sheet__note">✓ 本篇已解釋</p>
        ) : (
          <button
            className="btn btn--primary btn--sm"
            onClick={reexplain}
            disabled={busy}
            style={{ margin: "14px 0" }}
          >
            {busy ? "解釋中…" : "用本篇重新解釋"}
          </button>
        )}
```
在 `reexplain()`（第 251 行）的 catch 針對 403 顯示友善訊息（縱深防禦）：
```ts
  async function reexplain() {
    setBusy(true);
    setError(null);
    try {
      await api.reexplain({ articleId, paragraphId, word });
      // …既有成功流程不變…
    } catch (e) {
      const err = e as { status?: number; message?: string };
      setError(err.status === 403 ? "此功能限審稿者以上使用" : (err.message ?? "解釋失敗"));
    } finally {
      setBusy(false);
    }
  }
```
> 請比對 `reexplain` 既有實作，僅替換 catch 區塊與確保 `finally` 收尾；成功流程（`setExplanations`／`onExplained`／音檔輪詢）保持原樣。`ApiError` 具 `status` 欄位（見 `web-learner/src/api.ts`）。

- [ ] **Step 5：typecheck 與 build 驗證**

Run: `npm run typecheck -w @el/web-learner && npm run build -w @el/web-learner`
Expected: 皆成功。

Run（既有前端 lib 測試不受影響）：`npm test -w @el/web-learner`
Expected: PASS。

- [ ] **Step 6：Commit**

```bash
git add web-learner/src/api.ts web-learner/src/App.tsx
git commit -m "前台：即時單字翻譯依角色 gate，reader 隱藏並友善處理 403"
```

---

## 收尾驗證（全案）

- [ ] **全套測試**：`npm test`（需先啟動測試庫並套用 migration）。Expected: 全綠、無真實 LLM／TTS 呼叫。
- [ ] **手動煙霧測試**：以 `DEV_AUTH_BYPASS=1` + 不同 `DEV_USER_EMAIL`／`ADMIN_EMAILS` 組合，確認：
  - env 管理者：後台可見使用者頁、可改角色、改到自己（env admin）被擋。
  - 預先指派某 email 為審稿者 → 該 email 首次登入後 `/me` 為 reviewer、前台看得到「用本篇重新解釋」。
  - reader：前台看不到重新解釋按鈕；直接打 `POST /lookups` 得 403。

---

## Self-Review 對照 spec

- §1 資料模型（reviewer enum、last_seen_at、DB 不存 admin、登入不覆蓋角色）→ Task 1、3、4。✅
- §2 後端（requireReviewer、POST /lookups 守衛、三支 /users 端點、env admin 不可改）→ Task 4、5、6。✅
- §3 後台使用者管理頁（清單／改角色下拉／預先新增／env admin 唯讀）→ Task 7。✅
- §4 前台 gating（getMe 判角色、隱藏按鈕、403 友善訊息、縱深防禦）＋測試策略（mock LLM、測試庫）→ Task 8 + 各任務測試。✅
