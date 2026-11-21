import { q, sql } from "../db";
import type { Job, Strategy } from "../types";
import { prettyDate, weekdayShort } from "../dates";
import { storeProposals, type ProposalOut } from "./upgrades";
import { applyAnalysis, applyBrief } from "../analytics/review";

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
  art_style?: string;
  rationale: string;
};

export async function applyResult(job: Job, data: unknown): Promise<string> {
  const accountId = job.account_id!;
  switch (job.kind) {
    case "video":
    case "design": {
      const plan = data as { notes: string; scenes: { type: string; beats?: unknown[] }[] };
      if (!Array.isArray(plan?.scenes) || !plan.scenes.length) throw new Error("The plan has no scenes");
      await sql.run("UPDATE content SET production = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify(plan), job.ref_id);
      if (job.kind === "video") {
        const beats = plan.scenes.reduce((n, s) => n + (s.beats?.length ?? 0), 0);
        return `${plan.scenes.length} scenes, ${beats} motion beats planned — rendering next`;
      }
      const painted = plan.scenes.filter((s) => s.type === "illustration").length;
      return `${plan.scenes.length} slides planned (${painted} illustrated) — rendering next`;
    }
    case "analyze":
      return applyAnalysis(job, data);
    case "brief":
      return applyBrief(job, data);
    case "render":
      return "Rendered";
    case "publish":
      return "Posted";
    case "develop": {
      const out = data as { notes: string; proposals: ProposalOut[]; evaluated_sources: { url: string; verdict: string }[] };
      if (!Array.isArray(out?.proposals)) throw new Error("Agent Developer output is missing the proposals list");
      const { pending, blocked } = await storeProposals(job, out.proposals);
      const sources = out.evaluated_sources?.length ?? 0;
      const unsafe = (out.evaluated_sources ?? []).filter((s) => s.verdict === "unsafe").length;
      return `${pending} upgrade proposal${pending === 1 ? "" : "s"} waiting for your approval${blocked ? `, ${blocked} blocked by the safety filter` : ""} · ${sources} sources evaluated${unsafe ? ` (${unsafe} unsafe)` : ""}`;
    }
    case "strategy": {
      const s = data as Strategy;
      if (!s?.pillars) throw new Error("Strategy output is missing pillars");
      await sql.run("UPDATE accounts SET strategy = ?, strategy_updated_at = datetime('now') WHERE id = ?", JSON.stringify(s), accountId);
      return `Strategy ready: ${s.pillars.length} pillars, ${s.cadence?.posts_per_week ?? "?"} posts/week`;
    }

    case "trends": {
      const out = data as { scan_notes: string; trends: TrendOut[] };
      if (!Array.isArray(out?.trends)) throw new Error("Trend output is missing the trends list");
      for (const t of out.trends) {
        await sql.run(
          `INSERT INTO trends (account_id, job_id, title, summary, source, source_url, momentum, time_sensitivity,
            fit_score, fit_reason, angle, format, platform, risk_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      const trends = await q.trends({ accountId, limit: 500 });
      const findTrend = (title: string) => {
        if (job.kind === "from-trend" && job.ref_id) return job.ref_id;
        const t = title.trim().toLowerCase();
        return t ? (trends.find((x) => x.title.trim().toLowerCase() === t)?.id ?? null) : null;
      };
      for (const it of out.items) {
        const trendId = findTrend(it.trend_title);
        await sql.run(
          `INSERT INTO content (account_id, trend_id, job_id, title, pillar, platform, format, video_style, duration_seconds,
            hook, script, slides, caption, hashtags, cta, audio, suggested_day, planned_date, art_style, rationale, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scripted')`,
          accountId, trendId, job.id, it.title, it.pillar, it.platform, it.format, it.video_style,
          Math.round(it.duration_seconds || 0), it.hook, JSON.stringify(it.script ?? []), JSON.stringify(it.slides ?? []),
          it.caption, JSON.stringify((it.hashtags ?? []).map((h) => h.replace(/^#/, ""))), it.cta, it.audio,
          job.target_date ? weekdayShort(job.target_date) : it.suggested_day, job.target_date ?? null, it.art_style ?? "", it.rationale,
        );
        if (trendId) await sql.run("UPDATE trends SET status = 'used' WHERE id = ?", trendId);
      }
      const reels = out.items.filter((i) => i.format === "reel").length;
      const when = job.target_date ? ` for ${prettyDate(job.target_date)}` : "";
      return `${out.items.length} piece${out.items.length === 1 ? "" : "s"} scripted${when} (${reels} video${reels === 1 ? "" : "s"}, ${out.items.length - reels} post${out.items.length - reels === 1 ? "" : "s"}) — waiting for your approval`;
    }
  }
}
