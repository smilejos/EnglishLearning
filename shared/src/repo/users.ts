// users 資料存取（身分來自 Cloudflare Access，首次存取時 upsert）。
import type { UserRole } from "../schemas";
import { type Queryable, toNum, toIso } from "./types";

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
}

function mapUser(row: any): User {
  return {
    id: toNum(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: toIso(row.created_at),
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
