-- =============================================================================
-- 英文知識學習平台 — 資料表結構參考腳本（schema reference）
-- =============================================================================
--
-- 用途：
--   這份檔案是「設計文件 §4 資料模型」的可執行版本，讓你在 Phase 2 真正
--   動工前，就能完整看到所有表的欄位、型別、外鍵、唯一鍵與索引。
--
-- 與計畫的關係：
--   - 這是「參考腳本 / single source of truth 的具體化」，不是最終 migration。
--   - 計畫 Task 2.2 會用 node-pg-migrate 把同樣的結構寫成 migrations/*，
--     好處是有版本控管、可 up / down 回滾。本檔的 DDL 內容應與該 migration 完全一致。
--
-- 文章分類模型（本檔已採用的設計決定）：
--   - material_type：判別「課業內(school) / 課外(extracurricular)」，決定哪些欄位有意義。
--   - 課業內：靠 grade / unit / week / page。
--   - 課外：靠 categories（自我參照樹，category ▸ sub-category，層數彈性）+ tags。
--   - 不加跨欄位 CHECK 約束：欄位填法由應用層決定，DB 保持彈性。
--
-- 可直接執行（手動驗證 schema 用）：
--   psql "$DATABASE_URL" -f docs/schema-reference.sql
--   或在 compose 起來的 db 容器內：
--   docker compose exec -T db psql -U app -d english_learning < docs/schema-reference.sql
--
-- 慣例：
--   - 主鍵一律 BIGINT GENERATED ALWAYS AS IDENTITY。
--   - 時間戳一律 timestamptz，預設 now()。
--   - 四種處理狀態（pending/processing/done/failed）共用一個 ENUM 型別，
--     對應計畫「狀態列舉集中於 shared」的約束。
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 列舉型別
-- -----------------------------------------------------------------------------
-- 處理狀態：對應計畫 Global constraints「pending / processing / done / failed」。
-- 註：日後若要新增狀態值，ENUM 需用 ALTER TYPE ... ADD VALUE（不可移除值）。
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'done', 'failed');

-- 使用者角色（admin 可上傳文章；reader 只能閱讀）
CREATE TYPE user_role AS ENUM ('admin', 'reader');

-- 教材性質（課業內 / 課外）：決定文章該看哪一組分類欄位
CREATE TYPE material_type AS ENUM ('school', 'extracurricular');


-- -----------------------------------------------------------------------------
-- users：授權者帳號
-- 身分來自 Cloudflare Access 的 JWT，首次存取時 upsert 建立（見計畫 Task 4.1）。
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       TEXT        NOT NULL UNIQUE,            -- 來自 Access，唯一身分
    name        TEXT,
    role        user_role   NOT NULL DEFAULT 'reader',  -- 決定能否上傳
    created_at  timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- categories：課外教材的分類樹（自我參照）
--   parent_id IS NULL  → 頂層 category（例：故事、科普、新聞）
--   parent_id 指向上層 → sub-category（例：故事 ▸ 童話）
-- 用一張樹而非「category 欄 + sub_category 欄」，未來要加第三層也不必改 schema。
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_id  BIGINT   REFERENCES categories (id) ON DELETE CASCADE,
    label      TEXT     NOT NULL,                       -- 顯示名稱
    sort_order SMALLINT NOT NULL DEFAULT 0,             -- 同層排序
    UNIQUE (parent_id, label)                           -- 同一層名稱不重複
);

-- 列出某節點的子分類（前端級聯下拉用）
CREATE INDEX idx_categories_parent_id ON categories (parent_id);


-- -----------------------------------------------------------------------------
-- articles：文章
--   material_type 決定生效欄位：
--     - school          → grade / unit / week / page
--     - extracurricular → category_id（+ tags）
--   不加跨欄位 CHECK，保持彈性。
-- -----------------------------------------------------------------------------
CREATE TABLE articles (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title         TEXT              NOT NULL,
    material_type material_type     NOT NULL DEFAULT 'school',

    -- 課業內教材分類
    grade         TEXT,                                 -- 年級
    unit          TEXT,                                 -- 單元
    week          SMALLINT,                             -- 週別（數字，可排序）
    page          SMALLINT,                             -- 頁數（數字，可排序）

    -- 課外教材分類（指向 categories 的葉節點，通常是 sub-category）
    category_id   BIGINT            REFERENCES categories (id) ON DELETE SET NULL,

    -- 難度程度（兩種教材皆可用，視需要填）
    level         TEXT,

    status        processing_status NOT NULL DEFAULT 'pending',
    created_by    BIGINT            REFERENCES users (id),
    created_at    timestamptz       NOT NULL DEFAULT now(),
    updated_at    timestamptz       NOT NULL DEFAULT now()
);

-- 第一層導覽：課業內 / 課外
CREATE INDEX idx_articles_material_type ON articles (material_type);
-- 依課外分類篩選
CREATE INDEX idx_articles_category_id ON articles (category_id);


-- -----------------------------------------------------------------------------
-- paragraphs：段落（文章逐段切分後的處理單位）
-- en/zh_audio_path 存「相對路徑」，實際檔案在 AUDIO_DIR 共用 volume。
-- 檔名規則：articles/<articleId>/p<idx>.<lang>.wav（見計畫 Global constraints）。
-- -----------------------------------------------------------------------------
CREATE TABLE paragraphs (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id    BIGINT            NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    idx           INTEGER           NOT NULL,           -- 段落順序（0 起算）
    text          TEXT              NOT NULL,           -- 英文原文
    translation   TEXT,                                 -- 繁體中文翻譯（worker 填）
    en_audio_path TEXT,                                 -- 英文語音：念英文原文
    zh_audio_path TEXT,                                 -- 中文語音：念繁中翻譯
    status        processing_status NOT NULL DEFAULT 'pending',
    UNIQUE (article_id, idx)                            -- 同篇文章段落順序不重複
);

-- 查詢某篇文章的所有段落（閱讀頁、狀態輪詢）
CREATE INDEX idx_paragraphs_article_id ON paragraphs (article_id);


-- -----------------------------------------------------------------------------
-- jobs：worker 的佇列對象，每個待處理段落一筆
-- worker 以 SELECT ... FOR UPDATE SKIP LOCKED 認領（見計畫 Task 5.1）。
-- -----------------------------------------------------------------------------
CREATE TABLE jobs (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id   BIGINT            NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    paragraph_id BIGINT            NOT NULL REFERENCES paragraphs (id) ON DELETE CASCADE,
    status       processing_status NOT NULL DEFAULT 'pending',
    attempts     INTEGER           NOT NULL DEFAULT 0,  -- 重試次數
    error        TEXT,                                  -- 最近一次失敗訊息
    created_at   timestamptz       NOT NULL DEFAULT now(),
    updated_at   timestamptz       NOT NULL DEFAULT now()
);

-- worker 輪詢「下一個 pending job」用，最關鍵的索引
CREATE INDEX idx_jobs_status ON jobs (status);


-- -----------------------------------------------------------------------------
-- words：單字的「主要身分」，全站唯一一筆
-- normalized_word = 小寫 + trim（見 shared/normalizeWord，計畫 Task 1.2）。
-- en_audio_path 為單字英文發音，與脈絡無關，產生一次後所有解釋共用。
-- -----------------------------------------------------------------------------
CREATE TABLE words (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    normalized_word TEXT        NOT NULL UNIQUE,        -- 正規化後唯一
    en_audio_path   TEXT,                               -- 單字英文發音（共用）
    created_at      timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- word_explanations：單字的「解釋變體」
-- 每個 (單字, 文章) 一筆；同一單字可在不同文章累積多筆（核心特色）。
-- 解釋與例句皆中英雙語，且各自附語音路徑 —— 共 10 個內容欄位。
-- ★ 欄位名稱必須與設計 §4 完全一致（計畫 Global constraints 明文要求）。
-- -----------------------------------------------------------------------------
CREATE TABLE word_explanations (
    id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    word_id                    BIGINT      NOT NULL REFERENCES words (id) ON DELETE CASCADE,
    article_id                 BIGINT      NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    paragraph_id               BIGINT      REFERENCES paragraphs (id) ON DELETE SET NULL,

    -- ↓↓↓ 設計 §4 的 10 個內容欄位（5 組「文字 + 語音」）↓↓↓
    en_explanation             TEXT,       -- 1. 英文解釋
    en_explanation_audio_path  TEXT,       -- 2. 英文解釋語音
    en_example                 TEXT,       -- 3. 英文例句
    en_example_audio_path      TEXT,       -- 4. 英文例句語音
    zh_translation             TEXT,       -- 5. 繁中翻譯
    zh_translation_audio_path  TEXT,       -- 6. 繁中翻譯語音
    zh_explanation             TEXT,       -- 7. 中文解釋
    zh_explanation_audio_path  TEXT,       -- 8. 中文解釋語音
    zh_example                 TEXT,       -- 9. 中文例句
    zh_example_audio_path      TEXT,       -- 10. 中文例句語音
    -- ↑↑↑ 10 個內容欄位 ↑↑↑

    created_at                 timestamptz NOT NULL DEFAULT now(),

    UNIQUE (word_id, article_id)           -- 快取鍵：同單字同文章只解釋一次
);

-- 列出「某單字的所有解釋」（前端彈窗用，依 created_at 排序，計畫 Task 4.6）
CREATE INDEX idx_word_explanations_word_id ON word_explanations (word_id, created_at);
-- 由文章反查其底下的解釋
CREATE INDEX idx_word_explanations_article_id ON word_explanations (article_id);


-- -----------------------------------------------------------------------------
-- tags / article_tags：開放、可多值的分類（兩種教材皆可用，課外為主）
--   tags.kind 是命名空間（'topic' / 'grammar' / 'skill' ...）；
--   新增分類維度 = 新增資料列，永遠不必改 schema。
-- -----------------------------------------------------------------------------
CREATE TABLE tags (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind  TEXT NOT NULL,                                -- 命名空間（分類群組）
    label TEXT NOT NULL,                                -- 標籤文字
    UNIQUE (kind, label)
);

-- 同一 kind 的所有 tag（前端把同群組列成一組篩選器）
CREATE INDEX idx_tags_kind ON tags (kind);

CREATE TABLE article_tags (
    article_id BIGINT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    tag_id     BIGINT NOT NULL REFERENCES tags (id)     ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);

-- 由 tag 反查「掛此標籤的文章」
CREATE INDEX idx_article_tags_tag_id ON article_tags (tag_id);

COMMIT;

-- =============================================================================
-- 驗證查詢（對應計畫 Task 2.2 的 Verify）
-- =============================================================================
-- 確認 word_explanations 的欄位名稱與設計完全一致：
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'word_explanations' ORDER BY ordinal_position;
--
-- 確認唯一約束存在：
--   SELECT conname, contype FROM pg_constraint
--   WHERE conrelid = 'word_explanations'::regclass AND contype = 'u';
--
-- 列出某課外 category 樹（頂層 + 子分類）：
--   SELECT p.label AS category, c.label AS sub_category
--   FROM categories c LEFT JOIN categories p ON c.parent_id = p.id
--   ORDER BY p.sort_order, c.sort_order;
-- =============================================================================
