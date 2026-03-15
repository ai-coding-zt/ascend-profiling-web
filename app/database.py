"""SQLite 数据库初始化与辅助函数。"""

import aiosqlite

from app.config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    trace_path TEXT,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    question TEXT NOT NULL,
    context TEXT,
    image_paths TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);
"""


async def init_db():
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript(SCHEMA)
        # Migrate: add summary column if missing
        cursor = await db.execute("PRAGMA table_info(jobs)")
        cols = {r[1] for r in await cursor.fetchall()}
        if "summary" not in cols:
            await db.execute("ALTER TABLE jobs ADD COLUMN summary TEXT")
        await db.commit()


async def get_db():
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    return db
