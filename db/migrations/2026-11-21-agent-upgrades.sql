-- Agent Developer: upgrade proposals and which upgrades each job ran with.
--   npx wrangler d1 execute agent-hq --remote --file db/migrations/2026-11-21-agent-upgrades.sql
-- (Run once: ALTER TABLE is not idempotent.)

CREATE TABLE IF NOT EXISTS agent_upgrades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,  -- NULL = every account
  job_id INTEGER,                         -- the Agent Developer run that proposed it
  target_agent TEXT NOT NULL,             -- trend-scout | strategist | designer | video-producer
  focus TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'add',       -- add | replace
  before_text TEXT NOT NULL DEFAULT '',   -- replace: the passage it supersedes
  after_text TEXT NOT NULL,               -- the instruction text sent to the agent (already safety-filtered)
  source_type TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  why TEXT NOT NULL DEFAULT '',
  success_metric TEXT NOT NULL DEFAULT '',
  quality_score INTEGER NOT NULL DEFAULT 0,
  risk_notes TEXT NOT NULL DEFAULT '',
  safety_notes TEXT NOT NULL DEFAULT '',  -- what the safety filter removed, or why it was blocked
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | blocked | revoked
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  applied_at TEXT,                        -- when it started going to the agent (approval time)
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_upgrades_agent ON agent_upgrades(target_agent, status);

ALTER TABLE jobs ADD COLUMN upgrade_ids TEXT;  -- ",3,7," = approved upgrades this job ran with
