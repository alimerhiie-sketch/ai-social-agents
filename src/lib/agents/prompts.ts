import { db, q } from "../db";
import type { Account, Job } from "../types";

// Builds the task prompt for each job kind. Built when the job STARTS, not when it is
// queued, so a "plan" job that follows a "trends" job sees the trends that were just found.

const today = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function profile(a: Account) {
  return JSON.stringify(
    {
      name: a.name,
      niche: a.niche,
      description: a.description,
      target_audience: a.audience,
      language: a.language,
      platforms: a.platforms,
      handles: { instagram: a.ig_handle || "(not created yet)", tiktok: a.tiktok_handle || "(not created yet)" },
      tones: a.tones,
      allowed_formats: a.formats,
      allowed_video_styles: a.video_styles,
      posts_per_week: a.posts_per_week,
      brand_colors: a.brand_colors,
      topics_to_avoid: a.avoid || "(none given)",
      inspiration_accounts: a.inspiration || "(none given)",
    },
    null,
    2,
  );
}

function feedback(accountId: number) {
  const approved = db
    .prepare("SELECT title, format, hook FROM content WHERE account_id = ? AND status IN ('approved','producing','review','scheduled','posted') ORDER BY id DESC LIMIT 10")
    .all(accountId) as { title: string; format: string; hook: string }[];
  const rejected = db
    .prepare("SELECT title, format, hook, feedback FROM content WHERE account_id = ? AND status = 'rejected' ORDER BY id DESC LIMIT 10")
    .all(accountId) as { title: string; format: string; hook: string; feedback: string }[];
  if (!approved.length && !rejected.length) return "OWNER FEEDBACK\n(none yet — this is the first batch)";
  return [
    "OWNER FEEDBACK",
    "Approved (do more like these):",
    ...(approved.length ? approved.map((c) => `- [${c.format}] ${c.title} — hook: "${c.hook}"`) : ["- (none yet)"]),
    "Rejected (avoid, and respect the reason):",
    ...(rejected.length
      ? rejected.map((c) => `- [${c.format}] ${c.title} — hook: "${c.hook}" — reason: ${c.feedback || "(no reason given)"}`)
      : ["- (none yet)"]),
  ].join("\n");
}

function recentContent(accountId: number) {
  const rows = db
    .prepare("SELECT title FROM content WHERE account_id = ? ORDER BY id DESC LIMIT 40")
    .all(accountId) as { title: string }[];
  return rows.length ? rows.map((r) => `- ${r.title}`).join("\n") : "(none yet)";
}

function strategyBlock(a: Account) {
  return a.strategy
    ? `STRATEGY (follow it)\n${JSON.stringify(a.strategy, null, 2)}`
    : "STRATEGY\n(no strategy yet — infer sensible pillars from the profile)";
}

export function buildPrompt(job: Job): string {
  const a = job.account_id ? q.account(job.account_id) : null;
  if (!a) throw new Error("Account not found for this job");

  switch (job.kind) {
    case "strategy":
      return [
        `Today is ${today()}.`,
        `Build the growth strategy for this account. It is brand new: 0 followers, 0 posts. The owner sets it up by hand on ${a.platforms.join(" and ")}.`,
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        a.strategy ? `CURRENT STRATEGY (revise it; keep what still makes sense)\n${JSON.stringify(a.strategy, null, 2)}` : "",
        feedback(a.id),
        "",
        "Research briefly (3–5 searches) to see what is winning in this niche, then return the strategy as structured output.",
        "Only use formats from allowed_formats. Respect posts_per_week unless it is clearly too low to grow, in which case say so in cadence.notes.",
      ].join("\n");

    case "trends": {
      const seen = db
        .prepare("SELECT title FROM trends WHERE account_id = ? AND created_at > datetime('now','-21 days') ORDER BY id DESC LIMIT 60")
        .all(a.id) as { title: string }[];
      return [
        `Today is ${today()}.`,
        "Scan for what is trending RIGHT NOW that this account could turn into content.",
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        a.strategy ? `CONTENT PILLARS\n${a.strategy.pillars.map((p) => `- ${p.name}: ${p.description}`).join("\n")}` : "",
        "",
        "ALREADY FOUND (do not repeat these)",
        seen.length ? seen.map((s) => `- ${s.title}`).join("\n") : "(nothing yet)",
        "",
        "Return 8–12 trends, best fit first, as structured output.",
      ].join("\n");
    }

    case "plan": {
      const n = Math.max(1, Math.min(10, a.posts_per_week));
      const trends = db
        .prepare("SELECT title, summary, angle, format, fit_score, momentum, time_sensitivity FROM trends WHERE account_id = ? AND status = 'new' AND created_at > datetime('now','-7 days') ORDER BY fit_score DESC LIMIT 12")
        .all(a.id) as Record<string, string | number>[];
      return [
        `Today is ${today()}.`,
        `Plan and fully script the next ${n} pieces of content for this account (one week).`,
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        strategyBlock(a),
        "",
        "FRESH TRENDS (use the strongest where they fit; set trend_title to the exact title; mix with evergreen pillar content)",
        trends.length
          ? trends.map((t) => `- ${t.title} [fit ${t.fit_score}, ${t.momentum}, ${t.time_sensitivity}, ${t.format}] — ${t.summary} Angle: ${t.angle}`).join("\n")
          : "(no fresh trends — make it all evergreen pillar content)",
        "",
        "RECENT CONTENT (do not repeat)",
        recentContent(a.id),
        "",
        feedback(a.id),
        "",
        `Return exactly ${n} items as structured output. Only use allowed_formats and allowed_video_styles. Spread suggested_day across the week, putting time-sensitive trends first.`,
      ].join("\n");
    }

    case "from-trend": {
      const t = job.ref_id ? q.trend(job.ref_id) : null;
      if (!t) throw new Error("Trend not found for this job");
      return [
        `Today is ${today()}.`,
        "Turn this one trend into a single, fully scripted piece of content for the account.",
        "",
        "TREND",
        JSON.stringify({ title: t.title, what_is_happening: t.summary, source: t.source_url, momentum: t.momentum, suggested_angle: t.angle, suggested_format: t.format, risk_notes: t.risk_notes }, null, 2),
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        strategyBlock(a),
        "",
        "RECENT CONTENT (do not repeat)",
        recentContent(a.id),
        "",
        feedback(a.id),
        "",
        `Return exactly 1 item as structured output, with trend_title set to "${t.title}". You may improve on the suggested angle. If the suggested format is not in allowed_formats, pick the best allowed one.`,
      ].join("\n");
    }
  }
}
