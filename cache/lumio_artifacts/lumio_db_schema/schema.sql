-- Lumio SQLite schema, demo bake v0.1.0
-- Author: lumio_db_schema (step 2)
-- Produced: 2026-04-24T03:12:40Z
-- Engine: sqlite3 with WAL mode

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL,
    plan            TEXT NOT NULL CHECK (plan IN ('reader','deep','studio')),
    reading_profile TEXT,          -- JSON blob, ReadingProfile shape
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    verified_at     TEXT,
    deleted_at      TEXT
);

CREATE INDEX idx_users_plan ON users(plan);

CREATE TABLE reads (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    source       TEXT NOT NULL,
    url          TEXT,
    word_count   INTEGER NOT NULL DEFAULT 0,
    body_blob_id TEXT,
    saved_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reads_user_saved ON reads(user_id, saved_at DESC);

CREATE TABLE summaries (
    id           TEXT PRIMARY KEY,
    read_id      TEXT NOT NULL REFERENCES reads(id) ON DELETE CASCADE,
    mode         TEXT NOT NULL CHECK (mode IN ('brief','essay','paper')),
    body         TEXT NOT NULL,
    produced_by  TEXT NOT NULL,
    produced_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX uniq_summary_per_mode ON summaries(read_id, mode);

CREATE TABLE highlights (
    id             TEXT PRIMARY KEY,
    read_id        TEXT NOT NULL REFERENCES reads(id) ON DELETE CASCADE,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quote          TEXT NOT NULL,
    offset_start   INTEGER NOT NULL,
    offset_end     INTEGER NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_highlights_user ON highlights(user_id, created_at DESC);

CREATE TABLE concepts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    embedding   BLOB NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_concepts_user ON concepts(user_id);

CREATE TABLE concept_links (
    highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    concept_id   TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    weight       REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (highlight_id, concept_id)
);

CREATE TABLE recall_cards (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    highlight_id   TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    prompt         TEXT NOT NULL,
    expected_ans   TEXT NOT NULL,
    interval_days  INTEGER NOT NULL DEFAULT 1,
    next_due_at    TEXT NOT NULL,
    last_rated     INTEGER,        -- 0 skip, 1 again, 2 good, 3 easy
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_recall_due ON recall_cards(user_id, next_due_at);

CREATE TABLE reading_sessions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_id       TEXT REFERENCES reads(id) ON DELETE SET NULL,
    started_at    TEXT NOT NULL,
    ended_at      TEXT,
    wpm           REAL,
    focus_mode    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sessions_user ON reading_sessions(user_id, started_at DESC);
