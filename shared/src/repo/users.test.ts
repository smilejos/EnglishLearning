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
