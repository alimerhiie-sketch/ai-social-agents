import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Account, ContentItem, Job, Trend } from "./types";

// Data lives outside the OneDrive-synced Documents folder: OneDrive holds handles on
// freshly written files, which is poison for a live SQLite database.
export const DATA_DIR =
  process.env.HQ_DATA_DIR ||
  path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "ai-social-agents");
export const LOG_DIR = path.join(DATA_DIR, "logs");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'English',
  platforms TEXT NOT NULL DEFAULT '["instagram","tiktok"]',
  ig_handle TEXT NOT NULL DEFAULT '',
  tiktok_handle TEXT NOT NULL DEFAULT '',
  tones TEXT NOT NULL DEFAULT '[]',
  formats TEXT NOT NULL DEFAULT '[]',
  video_styles TEXT NOT NULL DEFAULT '[]',
  posts_per_week INTEGER NOT NULL DEFAULT 5,
  approval_mode TEXT NOT NULL DEFAULT 'manual',
  brand_colors TEXT NOT NULL DEFAULT '[]',
  avoid TEXT NOT NULL DEFAULT '',
  inspiration TEXT NOT NULL DEFAULT '',
  strategy TEXT,
  strategy_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_id INTEGER,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  momentum TEXT NOT NULL DEFAULT '',
  time_sensitivity TEXT NOT NULL DEFAULT '',
  fit_score INTEGER NOT NULL DEFAULT 0,
  fit_reason TEXT NOT NULL DEFAULT '',
  angle TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  risk_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  trend_id INTEGER REFERENCES trends(id) ON DELETE SET NULL,
  job_id INTEGER,
  title TEXT NOT NULL,
  pillar TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  video_style TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  hook TEXT NOT NULL DEFAULT '',
  script TEXT NOT NULL DEFAULT '[]',
  slides TEXT NOT NULL DEFAULT '[]',
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  cta TEXT NOT NULL DEFAULT '',
  audio TEXT NOT NULL DEFAULT '',
  suggested_day TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scripted',
  feedback TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  agent TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  ref_id INTEGER,
  depends_on INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  model TEXT,
  summary TEXT,
  error TEXT,
  cost_usd REAL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trends_account ON trends(account_id, status);
CREATE INDEX IF NOT EXISTS idx_content_account ON content(account_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`;

function open(): DatabaseSync {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "hq.db"));
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  d.exec(SCHEMA);
  // Migrations: which server process owns a running job, and the agent's own process id.
  // Daily mix per account, and per-day planning (jobs.target_date → content.planned_date).
  const migrations: [string, string][] = [
    ["jobs", "runner_pid INTEGER"],
    ["jobs", "child_pid INTEGER"],
    ["jobs", "target_date TEXT"],
    ["accounts", "reels_per_day INTEGER NOT NULL DEFAULT 1"],
    ["accounts", "posts_per_day INTEGER NOT NULL DEFAULT 0"],
    ["content", "planned_date TEXT"],
    ["accounts", "art_styles TEXT NOT NULL DEFAULT '[]'"],
    ["accounts", "character TEXT NOT NULL DEFAULT ''"],
    ["content", "art_style TEXT NOT NULL DEFAULT ''"],
    ["content", "production TEXT"],
    ["content", "media TEXT"],
  ];
  for (const [table, col] of migrations) {
    try {
      d.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
    } catch {
      /* already there */
    }
  }
  return d;
}

const g = globalThis as unknown as { __hqDb?: DatabaseSync };
export const db: DatabaseSync = (g.__hqDb ??= open());

// ---------- row mappers ----------

type Row = Record<string, unknown>;
// node:sqlite returns null-prototype rows, which React refuses to pass to client components.
const plain = <T extends object | undefined>(r: T): T => (r ? ({ ...r } as T) : r);
const arr = <T = string>(v: unknown): T[] => {
  try {
    const p = JSON.parse(String(v ?? "[]"));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

const obj = <T,>(v: unknown): T | null => {
  try {
    return v ? (JSON.parse(String(v)) as T) : null;
  } catch {
    return null;
  }
};

export function toAccount(r: Row): Account {
  let strategy = null;
  try {
    strategy = r.strategy ? JSON.parse(String(r.strategy)) : null;
  } catch {}
  return {
    ...(r as unknown as Account),
    platforms: arr(r.platforms),
    tones: arr(r.tones),
    formats: arr(r.formats),
    video_styles: arr(r.video_styles),
    brand_colors: arr(r.brand_colors),
    art_styles: arr(r.art_styles),
    strategy,
  };
}

export function toContent(r: Row): ContentItem {
  return {
    ...(r as unknown as ContentItem),
    script: arr(r.script),
    slides: arr(r.slides),
    hashtags: arr(r.hashtags),
    production: obj(r.production),
    media: obj(r.media),
  };
}

// ---------- queries ----------

export const q = {
  accounts(): Account[] {
    return db.prepare("SELECT * FROM accounts ORDER BY id").all().map(toAccount);
  },
  account(id: number): Account | null {
    const r = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    return r ? toAccount(r) : null;
  },
  trends(opts: { accountId?: number; status?: string; limit?: number } = {}): Trend[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.accountId) {
      where.push("account_id = ?");
      args.push(opts.accountId);
    }
    if (opts.status) {
      where.push("status = ?");
      args.push(opts.status);
    }
    const sql = `SELECT * FROM trends ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY date(created_at) DESC, fit_score DESC, id DESC LIMIT ${opts.limit ?? 200}`;
    return db.prepare(sql).all(...args).map(plain) as unknown as Trend[];
  },
  trend(id: number): Trend | null {
    return (plain(db.prepare("SELECT * FROM trends WHERE id = ?").get(id)) as unknown as Trend) ?? null;
  },
  content(opts: { accountId?: number; status?: string; limit?: number } = {}): ContentItem[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.accountId) {
      where.push("account_id = ?");
      args.push(opts.accountId);
    }
    if (opts.status) {
      where.push("status = ?");
      args.push(opts.status);
    }
    const sql = `SELECT * FROM content ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY planned_date IS NULL, planned_date, id LIMIT ${opts.limit ?? 300}`;
    return db.prepare(sql).all(...args).map(toContent);
  },
  contentItem(id: number): ContentItem | null {
    const r = db.prepare("SELECT * FROM content WHERE id = ?").get(id);
    return r ? toContent(r) : null;
  },
  jobs(opts: { accountId?: number; limit?: number } = {}): Job[] {
    const sql = opts.accountId
      ? `SELECT * FROM jobs WHERE account_id = ? ORDER BY id DESC LIMIT ${opts.limit ?? 50}`
      : `SELECT * FROM jobs ORDER BY id DESC LIMIT ${opts.limit ?? 50}`;
    const rows = opts.accountId ? db.prepare(sql).all(opts.accountId) : db.prepare(sql).all();
    return rows.map(plain) as unknown as Job[];
  },
  job(id: number): Job | null {
    return (plain(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id)) as unknown as Job) ?? null;
  },
  activeJobs(): Job[] {
    return db
      .prepare("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY id")
      .all()
      .map(plain) as unknown as Job[];
  },
  setting(key: string, fallback: string): string {
    const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return r?.value ?? fallback;
  },
  setSetting(key: string, value: string) {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  },
  counts(accountId: number) {
    const c = (sql: string) => (db.prepare(sql).get(accountId) as { n: number }).n;
    return {
      newTrends: c("SELECT COUNT(*) n FROM trends WHERE account_id = ? AND status = 'new'"),
      scripted: c("SELECT COUNT(*) n FROM content WHERE account_id = ? AND status = 'scripted'"),
      approved: c("SELECT COUNT(*) n FROM content WHERE account_id = ? AND status = 'approved'"),
      posted: c("SELECT COUNT(*) n FROM content WHERE account_id = ? AND status = 'posted'"),
    };
  },
};
