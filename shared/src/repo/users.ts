// users 資料存取（身分來自 Cloudflare Access，首次存取時 ensureUser）。
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

export interface UpsertUserInput {
  email: string;
  name?: string | null;
  role?: UserRole;
}

/**
 * 依 email upsert 使用者。已存在則更新 name（提供時）與 role，回傳最新列。
 * role 由呼叫端（auth 中介層）依允許清單決定。
 */
export async function upsertUser(
  db: Queryable,
  input: UpsertUserInput,
): Promise<User> {
  const res = await db.query(
    `INSERT INTO users (email, name, role)
     VALUES ($1, $2, COALESCE($3::user_role, 'reader'))
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, users.name),
       role = COALESCE($3::user_role, users.role)
     RETURNING *`,
    [input.email, input.name ?? null, input.role ?? null],
  );
  return mapUser(res.rows[0]);
}

export async function getUserByEmail(
  db: Queryable,
  email: string,
): Promise<User | null> {
  const res = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return res.rows[0] ? mapUser(res.rows[0]) : null;
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
