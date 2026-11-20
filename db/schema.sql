-- Agent HQ on Cloudflare D1. Apply with:
--   npx wrangler d1 execute agent-hq --remote --file db/schema.sql

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
  reels_per_day INTEGER NOT NULL DEFAULT 1,
  posts_per_day INTEGER NOT NULL DEFAULT 0,
  approval_mode TEXT NOT NULL DEFAULT 'manual',
  brand_colors TEXT NOT NULL DEFAULT '[]',
  art_styles TEXT NOT NULL DEFAULT '[]',
  character TEXT NOT NULL DEFAULT '',
  reel_times TEXT NOT NULL DEFAULT '13:00, 20:00',
  post_times TEXT NOT NULL DEFAULT '09:30, 17:30',
  ai_disclosure TEXT NOT NULL DEFAULT 'Illustrated with AI.',
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
  planned_date TEXT,
  art_style TEXT NOT NULL DEFAULT '',
  production TEXT,
  media TEXT,
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scripted',
  feedback TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Jobs are claimed by the GitHub Actions runner (runner_id = the Actions run) instead of a local process.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  agent TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  ref_id INTEGER,
  depends_on INTEGER,
  target_date TEXT,
  not_before TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  model TEXT,
  runner_id TEXT,
  heartbeat_at TEXT,
  summary TEXT,
  error TEXT,
  cost_usd REAL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  line TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per platform a piece goes to. Instagram: the cron posts via the API; TikTok: your phone page.
-- container_id / container_at: an Instagram media container waiting to finish processing (two-phase publish).
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TEXT NOT NULL,
  container_id TEXT,
  container_at TEXT,
  posted_at TEXT,
  remote_id TEXT,
  permalink TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connections (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  remote_user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL,
  expires_at TEXT,
  refreshed_at TEXT,
  provider TEXT NOT NULL DEFAULT 'graph',  -- 'graph' (own Meta token) | 'composio' (managed OAuth)
  provider_account_id TEXT,               -- Composio connected account id (ca_…)
  provider_user_id TEXT,                  -- Composio user id
  PRIMARY KEY (account_id, platform)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trends_account ON trends(account_id, status);
CREATE INDEX IF NOT EXISTS idx_content_account ON content(account_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_when ON posts(status, scheduled_at);
