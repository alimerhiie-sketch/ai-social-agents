import { db, q } from "../db";
import type { Job, Strategy } from "../types";

// Writes an agent's structured output into the database. Returns a one-line summary.

type TrendOut = {
  title: string;
  what_is_happening: string;
  source: string;
  source_url: string;
  momentum: string;
  time_sensitivity: string;
  fit_score: number;
  fit_reason: string;
  angle: string;
  format: string;
  platform: string;
  risk_notes: string;
};

type ItemOut = {
  title: string;
  pillar: string;
  platform: string;
  format: string;
  trend_title: string;
  video_style: string;
  duration_seconds: number;
  hook: string;
  script: unknown[];
  slides: unknown[];
  caption: string;
  hashtags: string[];
  cta: string;
  audio: string;
  suggested_day: string;
  rationale: string;
};

export function applyResult(job: Job, data: unknown): string {
  const accountId = job.account_id!;
  switch (job.kind) {
    case "strategy": {
      const s = data as Strategy;
      if (!s?.pillars) throw new Error("Strategy output is missing pillars");
      db.prepare("UPDATE accounts SET strategy = ?, strategy_updated_at = datetime('now') WHERE id = ?").run(
        JSON.stringify(s),
        accountId,
      );
      return `Strategy ready: ${s.pillars.length} pillars, ${s.cadence?.posts_per_week ?? "?"} posts/week`;
    }

    case "trends": {
      const out = data as { scan_notes: string; trends: TrendOut[] };
      if (!Array.isArray(out?.trends)) throw new Error("Trend output is missing the trends list");
      const ins = db.prepare(
        `INSERT INTO trends (account_id, job_id, title, summary, source, source_url, momentum, time_sensitivity,
          fit_score, fit_reason, angle, format, platform, risk_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const t of out.trends) {
        ins.run(
          accountId, job.id, t.title, t.what_is_happening, t.source, t.source_url, t.momentum, t.time_sensitivity,
          Math.max(0, Math.min(100, Math.round(t.fit_score))), t.fit_reason, t.angle, t.format, t.platform, t.risk_notes,
        );
      }
      const top = [...out.trends].sort((a, b) => b.fit_score - a.fit_score)[0];
      return `${out.trends.length} trends found${top ? ` · best: "${top.title}" (${top.fit_score})` : ""}`;
    }

    case "plan":
    case "from-trend": {
      const out = data as { notes: string; items: ItemOut[] };
      if (!Array.isArray(out?.items)) throw new Error("Plan output is missing the items list");
      const trends = q.trends({ accountId, limit: 500 });
      const findTrend = (title: string) => {
        if (job.kind === "from-trend" && job.ref_id) return job.ref_id;
        const t = title.trim().toLowerCase();
        return t ? (trends.find((x) => x.title.trim().toLowerCase() === t)?.id ?? null) : null;
      };
      const ins = db.prepare(
        `INSERT INTO content (account_id, trend_id, job_id, title, pillar, platform, format, video_style, duration_seconds,
          hook, script, slides, caption, hashtags, cta, audio, suggested_day, rationale, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scripted')`,
      );
      const markUsed = db.prepare("UPDATE trends SET status = 'used' WHERE id = ?");
      for (const it of out.items) {
        const trendId = findTrend(it.trend_title);
        ins.run(
          accountId, trendId, job.id, it.title, it.pillar, it.platform, it.format, it.video_style,
          Math.round(it.duration_seconds || 0), it.hook, JSON.stringify(it.script ?? []), JSON.stringify(it.slides ?? []),
          it.caption, JSON.stringify((it.hashtags ?? []).map((h) => h.replace(/^#/, ""))), it.cta, it.audio,
          it.suggested_day, it.rationale,
        );
        if (trendId) markUsed.run(trendId);
      }
      return `${out.items.length} piece${out.items.length === 1 ? "" : "s"} scripted and waiting for your approval`;
    }
  }
}
