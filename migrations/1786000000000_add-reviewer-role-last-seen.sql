-- Up Migration
-- 角色新增「審稿者」；users 新增 last_seen_at 以區分「已登入過」與「預先指派」。
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'reviewer';
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS last_seen_at;
-- 註：PostgreSQL 無法移除單一 enum 值，down 不還原 'reviewer'（殘留無害）。
