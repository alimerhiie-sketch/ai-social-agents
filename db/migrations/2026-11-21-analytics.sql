-- Analyst + Manager: post insights, daily account snapshots, weekly reports and briefs.
--   npx wrangler d1 execute agent-hq --remote --file db/migrations/2026-11-21-analytics.sql
-- Safe to run again (only CREATE … IF NOT EXISTS).

-- One row per post per checkpoint (1h, 24h, 72h, 7d after posting). Instagram today; TikTok once it is connected.
CREATE TABLE IF NOT EXISTS post_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  checkpoint TEXT NOT NULL,          -- 1h | 24h | 72h | 7d
  age_hours REAL NOT NULL,           -- actual age of the post when fetched
  views INTEGER,
  reach INTEGER,
  likes INTEGER,
  comments INTEGER,
  saves INTEGER,
  shares INTEGER,
  interactions INTEGER,
  follows INTEGER,                   -- feed posts only (Instagram doesn't report it per reel)
  profile_visits INTEGER,            -- feed posts only
  avg_watch_ms INTEGER,              -- reels only
  total_watch_ms INTEGER,            -- reels only
  skip_rate REAL,                    -- reels only: % of views that skipped in the first 3 s
  error TEXT,                        -- the fetch failed (deleted post, API change); counts as done
  raw TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id, checkpoint)
);
CREATE INDEX IF NOT EXISTS idx_post_metrics_account ON post_metrics(account_id, fetched_at);

-- One row per account, platform and local day. followers = count when fetched (just after that day ended).
CREATE TABLE IF NOT EXISTS account_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  date TEXT NOT NULL,                -- YYYY-MM-DD, Asia/Beirut
  followers INTEGER,
  following INTEGER,
  media_count INTEGER,
  reach INTEGER,
  views INTEGER,
  profile_views INTEGER,
  accounts_engaged INTEGER,
  interactions INTEGER,
  follows INTEGER,
  unfollows INTEGER,
  raw TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, platform, date)
);

-- Weekly Analyst reports (kind 'analysis') and Manager briefs (kind 'brief').
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  job_id INTEGER,
  period_start TEXT NOT NULL,        -- YYYY-MM-DD
  period_end TEXT NOT NULL,
  data TEXT NOT NULL,                -- the agent's structured output
  stats TEXT,                        -- numbers computed by us, not the agent
  changes TEXT,                      -- brief: what the Manager changed in the mix (JSON list)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_account ON reports(account_id, kind, id);
