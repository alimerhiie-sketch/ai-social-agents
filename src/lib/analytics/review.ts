import { q, sql } from "../db";
import { addDays, localDateTime, prettyDate, todayLocal, TZ } from "../dates";
import { enqueue } from "../queue";
import { ART_STYLES } from "../options";
import type { Account, Job } from "../types";

// The weekly review loop:
//   Sunday 03:00 → Analyst ("analyze" job) reads the week's insights and writes a report with recommendations
//                → Manager ("brief" job, waits for it) writes the owner's brief and sets next week's mix
//   every scripting job after that → the Strategist's prompt carries the recommendations and the day's mix
// Volume (reels/posts per day) and what is enabled stay the owner's: the Manager only re-weights within them,
// and applyBrief() enforces that whatever the agent returns.

export const REVIEW_WEEKDAY = "Sun";
const WINDOW_DAYS = 7;

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Data

export type MetricRow = {
  post_id: number;
  checkpoint: string;
  age_hours: number;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  interactions: number | null;
  follows: number | null;
  profile_visits: number | null;
  avg_watch_ms: number | null;
  total_watch_ms: number | null;
  skip_rate: number | null;
  error: string | null;
  fetched_at: string;
};

export type PostWithMetrics = {
  post_id: number;
  platform: string;
  method: string;
  remote_id: string | null;
  posted_at: string;
  permalink: string | null;
  content_id: number;
  title: string;
  format: string;
  pillar: string;
  art_style: string;
  video_style: string;
  duration_seconds: number;
  hook: string;
  trend_title: string | null;
  snapshots: MetricRow[];
  /** Most recent successful snapshot. */
  latest: MetricRow | null;
};

/** Posted pieces since `sinceIso`, newest first, with every insights snapshot. */
export async function postsWithMetrics(accountId: number, sinceIso: string): Promise<PostWithMetrics[]> {
  const posts = await sql.all<Omit<PostWithMetrics, "snapshots" | "latest">>(
    `SELECT p.id post_id, p.platform, p.method, p.remote_id, p.posted_at, p.permalink, c.id content_id, c.title, c.format, c.pillar, c.art_style,
       c.video_style, c.duration_seconds, c.hook, t.title trend_title
     FROM posts p JOIN content c ON c.id = p.content_id LEFT JOIN trends t ON t.id = c.trend_id
     WHERE p.account_id = ? AND p.status = 'posted' AND p.posted_at >= ?
     ORDER BY p.posted_at DESC LIMIT 200`,
    accountId,
    sinceIso,
  );
  if (!posts.length) return [];
  const rows = await sql.all<MetricRow>(
    `SELECT m.* FROM post_metrics m JOIN posts p ON p.id = m.post_id WHERE m.account_id = ? AND p.posted_at >= ? ORDER BY m.post_id, m.age_hours`,
    accountId,
    sinceIso,
  );
  const by = new Map<number, MetricRow[]>();
  for (const r of rows) by.set(r.post_id, [...(by.get(r.post_id) ?? []), r]);
  return posts.map((p) => {
    const snaps = by.get(p.post_id) ?? [];
    return { ...p, snapshots: snaps, latest: snaps.filter((s) => !s.error).at(-1) ?? null };
  });
}

export type AccountDay = { date: string; followers: number | null; reach: number | null; views: number | null; profile_views: number | null; follows: number | null; unfollows: number | null };

export async function accountSeries(accountId: number, days: number): Promise<AccountDay[]> {
  return sql.all<AccountDay>(
    "SELECT date, followers, reach, views, profile_views, follows, unfollows FROM account_metrics WHERE account_id = ? AND platform = 'instagram' AND date >= ? ORDER BY date",
    accountId,
    addDays(todayLocal(), -days),
  );
}

export type Report = { id: number; account_id: number; kind: string; job_id: number | null; period_start: string; period_end: string; data: Json; stats: Stats | null; changes: string[]; created_at: string };

export async function latestReport(accountId: number, kind: "analysis" | "brief"): Promise<Report | null> {
  const r = await sql.get<Record<string, unknown>>("SELECT * FROM reports WHERE account_id = ? AND kind = ? ORDER BY id DESC LIMIT 1", accountId, kind);
  if (!r) return null;
  const parse = (v: unknown, fb: unknown) => {
    try {
      return v ? JSON.parse(String(v)) : fb;
    } catch {
      return fb;
    }
  };
  return { ...(r as unknown as Report), data: parse(r.data, {}), stats: parse(r.stats, null), changes: parse(r.changes, []) };
}

export type Stats = {
  posts: number;
  tracked: number;
  views: number;
  reach: number;
  interactions: number;
  saves: number;
  shares: number;
  followersStart: number | null;
  followersEnd: number | null;
  byFormat: Record<string, { pieces: number; views: number; reach: number }>;
};

/** The numbers we compute ourselves (the agent explains them; the dashboard shows these). */
export function computeStats(posts: PostWithMetrics[], series: AccountDay[]): Stats {
  const s: Stats = { posts: posts.length, tracked: 0, views: 0, reach: 0, interactions: 0, saves: 0, shares: 0, followersStart: null, followersEnd: null, byFormat: {} };
  for (const p of posts) {
    const m = p.latest;
    if (!m) continue;
    s.tracked++;
    s.views += m.views ?? 0;
    s.reach += m.reach ?? 0;
    s.interactions += m.interactions ?? 0;
    s.saves += m.saves ?? 0;
    s.shares += m.shares ?? 0;
    const f = (s.byFormat[p.format] ??= { pieces: 0, views: 0, reach: 0 });
    f.pieces++;
    f.views += m.views ?? 0;
    f.reach += m.reach ?? 0;
  }
  const withF = series.filter((d) => d.followers != null);
  s.followersStart = withF[0]?.followers ?? null;
  s.followersEnd = withF.at(-1)?.followers ?? null;
  return s;
}

const fmtNum = (v: number | null | undefined) => (v == null ? "–" : String(v));

/** "68 views · 62 reach · 0 likes … · skip 74.6% · avg watch 2.8 s" */
export function metricText(m: MetricRow): string {
  const parts = [
    `${fmtNum(m.views)} views`,
    `${fmtNum(m.reach)} reach`,
    `${fmtNum(m.likes)} likes`,
    `${fmtNum(m.comments)} comments`,
    `${fmtNum(m.saves)} saves`,
    `${fmtNum(m.shares)} shares`,
  ];
  if (m.follows != null) parts.push(`${m.follows} follows`);
  if (m.profile_visits != null) parts.push(`${m.profile_visits} profile visits`);
  if (m.skip_rate != null) parts.push(`skip ${m.skip_rate}% in first 3 s`);
  if (m.avg_watch_ms != null) parts.push(`avg watch ${(m.avg_watch_ms / 1000).toFixed(1)} s`);
  return parts.join(" · ");
}

const cut = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const styleLabel = (id: string) => ART_STYLES.find((s) => s.id === id)?.label ?? id;

// ---------------------------------------------------------------------------
// Scheduling

/** Sundays from the nightly cycle (or now, from the dashboard): Analyst, then the Manager's brief. */
export async function enqueueWeeklyReview(accountId: number, now = false): Promise<number[]> {
  if (!now) {
    const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(new Date());
    if (weekday !== REVIEW_WEEKDAY) return [];
    const recent = await sql.get<{ n: number }>(
      "SELECT COUNT(*) n FROM jobs WHERE kind = 'analyze' AND account_id = ? AND (status IN ('queued','running') OR created_at > datetime('now','-5 days'))",
      accountId,
    );
    if (recent?.n) return [];
  } else {
    const busy = await sql.get<{ id: number }>("SELECT id FROM jobs WHERE kind IN ('analyze','brief') AND account_id = ? AND status IN ('queued','running') ORDER BY id LIMIT 1", accountId);
    if (busy) return [busy.id];
  }
  const analyze = await enqueue("analyze", accountId);
  return [analyze, await enqueue("brief", accountId, { dependsOn: analyze })];
}

// ---------------------------------------------------------------------------
// Prompts

function postBlock(p: PostWithMetrics) {
  const head = `#${p.content_id} [${p.format} · ${p.platform === "instagram" ? "IG" : "TikTok"} · posted ${localDateTime(p.posted_at)}] "${p.title}"`;
  const meta = [
    p.pillar && `pillar: ${p.pillar}`,
    p.art_style && `art style: ${styleLabel(p.art_style)}`,
    p.video_style && `video style: ${p.video_style}`,
    p.duration_seconds ? `${p.duration_seconds}s` : "",
    p.trend_title ? `trend: "${p.trend_title}"` : "evergreen",
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [head, `  ${meta}`, `  hook: "${cut(p.hook, 160)}"`];
  if (p.platform !== "instagram") lines.push("  (no metrics: TikTok isn't connected yet; this was posted by hand)");
  else if (!p.remote_id) lines.push("  (no metrics: marked posted by hand, so we have no Instagram media id for it)");
  else if (!p.snapshots.length) lines.push("  (no insights read yet)");
  for (const m of p.snapshots)
    lines.push(m.error ? `  ${m.checkpoint}: could not read (${cut(m.error, 120)})` : `  at ${m.checkpoint} (${m.age_hours}h old): ${metricText(m)}`);
  return lines.join("\n");
}

const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });

async function windowData(accountId: number) {
  const end = todayLocal();
  const start = addDays(end, -WINDOW_DAYS);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const posts = await postsWithMetrics(accountId, since);
  const series = await accountSeries(accountId, WINDOW_DAYS + 7);
  return { start, end, posts, series, stats: computeStats(posts, series.filter((d) => d.date >= start)) };
}

export async function analysisPrompt(job: Job, a: Account): Promise<string> {
  const { start, end, posts, series, stats } = await windowData(a.id);
  const older = await postsWithMetrics(a.id, new Date(Date.now() - 35 * 86400_000).toISOString());
  const before = older.filter((p) => !posts.some((x) => x.post_id === p.post_id));
  const prev = await latestReport(a.id, "analysis");
  const mix = await currentMix(a);
  return [
    `Today is ${today()}. Review this account's results for ${prettyDate(start)} – ${prettyDate(end)} and report to the team.`,
    "",
    "ACCOUNT",
    JSON.stringify(
      {
        name: a.name,
        niche: a.niche,
        handles: { instagram: a.ig_handle, tiktok: a.tiktok_handle },
        daily_output: `${a.reels_per_day} reel(s) + ${a.posts_per_day} feed post(s) a day`,
        posting_times: { reels: a.reel_times, feed_posts: a.post_times, zone: TZ },
        pillars: a.strategy?.pillars.map((p) => p.name) ?? [],
        kpis: a.strategy?.kpis ?? [],
      },
      null,
      2,
    ),
    "",
    "TOTALS WE COMPUTED (latest snapshot per post; use these, don't re-add)",
    JSON.stringify(stats, null, 2),
    "",
    "DAILY ACCOUNT SNAPSHOTS (Instagram; followers = count at the end of that day; reach/views = that day's totals)",
    series.length ? series.map((d) => `- ${d.date}: ${fmtNum(d.followers)} followers · ${fmtNum(d.reach)} reach · ${fmtNum(d.views)} views · ${fmtNum(d.profile_views)} profile views${d.follows != null ? ` · +${d.follows}/-${d.unfollows ?? 0} follows` : ""}`).join("\n") : "(none yet — the first snapshot is taken after the first full day)",
    "",
    `POSTS IN THE WINDOW (${posts.length}), with insights at 1h / 24h / 72h / 7d after posting`,
    "Compare like with like: a post that is 4 hours old can't be judged against one that is 3 days old. Prefer the 24h numbers when comparing.",
    posts.length ? posts.map(postBlock).join("\n\n") : "(nothing posted this week)",
    "",
    before.length ? `EARLIER POSTS (for context, latest numbers only)\n${before.map((p) => `- #${p.content_id} [${p.format}] "${p.title}" — ${p.latest ? metricText(p.latest) : "no insights"}`).join("\n")}\n` : "",
    "MIX THE MANAGER SET FOR THIS WEEK",
    mix.set_at ? describeMix(mix) : "(none yet — the Strategist chose formats and art styles freely)",
    "",
    prev
      ? `YOUR PREVIOUS REPORT (${prettyDate(prev.period_end)}) — say whether its recommendations helped\n${JSON.stringify({ headline: prev.data.headline, recommendations: prev.data.recommendations }, null, 2)}`
      : "YOUR PREVIOUS REPORT\n(none — this is the first weekly report)",
    "",
    `Return the report as structured output (job #${job.id}).`,
  ].join("\n");
}

export async function briefPrompt(job: Job, a: Account): Promise<string> {
  const report = await latestReport(a.id, "analysis");
  const { start, end, stats } = await windowData(a.id);
  const mix = await currentMix(a);
  const counts = await sql.all<{ status: string; n: number }>("SELECT status, COUNT(*) n FROM content WHERE account_id = ? AND status NOT IN ('posted','rejected') GROUP BY status", a.id);
  const scheduled = await sql.get<{ n: number }>(
    "SELECT COUNT(*) n FROM posts WHERE account_id = ? AND status IN ('scheduled','publishing') AND scheduled_at <= ?",
    a.id,
    new Date(Date.now() + 7 * 86400_000).toISOString(),
  );
  const failed = await sql.all<{ id: number; platform: string; error: string }>(
    "SELECT id, platform, error FROM posts WHERE account_id = ? AND status = 'failed' AND created_at > datetime('now','-7 days') ORDER BY id DESC LIMIT 8",
    a.id,
  );
  const phoneLate = await sql.get<{ n: number }>(
    "SELECT COUNT(*) n FROM posts WHERE account_id = ? AND method = 'phone' AND status = 'scheduled' AND scheduled_at < ?",
    a.id,
    new Date().toISOString(),
  );
  const failedJobs = await sql.get<{ n: number }>("SELECT COUNT(*) n FROM jobs WHERE account_id = ? AND status = 'failed' AND created_at > datetime('now','-7 days')", a.id);
  const pendingUpgrades = await sql.get<{ n: number }>("SELECT COUNT(*) n FROM agent_upgrades WHERE status = 'pending' AND (account_id IS NULL OR account_id = ?)", a.id);
  const tiktok = await q.connection(a.id, "tiktok");
  const feedFormats = a.formats.filter((f) => f === "carousel" || f === "post");
  const styles = a.art_styles.length ? a.art_styles : ["ghibli"];
  const weekPieces = 7 * (a.reels_per_day + a.posts_per_day);
  return [
    `Today is ${today()}. Write this week's brief for the owner (${prettyDate(start)} – ${prettyDate(end)}) and set next week's mix.`,
    "",
    "WHAT YOU MAY CHANGE (anything else is the owner's call — put it under decisions)",
    JSON.stringify(
      {
        fixed_volume: `${a.reels_per_day} reel(s) + ${a.posts_per_day} feed post(s) every day = ${weekPieces} pieces a week. You cannot change this.`,
        enabled_formats: feedFormats,
        enabled_art_styles: styles.map((id) => ({ id, label: styleLabel(id) })),
        posting_times: { reels: a.reel_times, feed_posts: a.post_times, note: "owner's setting — recommend changes under decisions" },
        platforms: a.platforms,
        tiktok: tiktok ? "connected" : "not connected — TikTok posts go out by hand from the phone page, so there are no TikTok numbers",
      },
      null,
      2,
    ),
    "",
    "CURRENT MIX",
    mix.set_at ? describeMix(mix) : "(none set yet — the Strategist chose freely; treat it as an even split)",
    "",
    "THE ANALYST'S REPORT",
    report ? JSON.stringify(report.data, null, 2) : "(no report — the Analyst run failed; keep the mix and say the data is missing)",
    "",
    "OUR NUMBERS",
    JSON.stringify(stats, null, 2),
    "",
    "PIPELINE AND OPERATIONS",
    `- Pieces in the pipeline by status: ${counts.map((c) => `${c.status} ${c.n}`).join(", ") || "none"}`,
    `- Posts scheduled for the next 7 days: ${scheduled?.n ?? 0} (a full week is ${weekPieces * a.platforms.length} across ${a.platforms.join(" + ")})`,
    `- TikTok posts past their slot, still waiting on the phone page: ${phoneLate?.n ?? 0}`,
    `- Failed posts this week: ${failed.length ? failed.map((f) => `#${f.id} ${f.platform}: ${cut(f.error, 140)}`).join("; ") : "none"}`,
    `- Failed agent runs this week: ${failedJobs?.n ?? 0}`,
    `- Agent upgrades waiting for the owner's approval: ${pendingUpgrades?.n ?? 0}`,
    "",
    `Return the brief as structured output (job #${job.id}).`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The mix (set by the Manager, used by the Strategist's daily scripting)

export type Share = { key: string; share: number };
export type Mix = { feed_formats: Share[]; art_styles: Share[]; focus: string; reason: string; set_at: string | null; start_date: string | null; brief_id: number | null };

/** The stored mix, cleaned against what the owner has enabled now (they may have changed settings since). */
export async function currentMix(a: Account): Promise<Mix> {
  const feed = a.formats.filter((f) => f === "carousel" || f === "post");
  const styles = a.art_styles.length ? a.art_styles : ["ghibli"];
  let raw: Partial<Mix> = {};
  try {
    raw = JSON.parse(await q.setting(`mix:${a.id}`, "{}"));
  } catch {}
  return {
    feed_formats: normalize(raw.feed_formats ?? [], feed),
    art_styles: normalize(raw.art_styles ?? [], styles),
    focus: raw.focus ?? "",
    reason: raw.reason ?? "",
    set_at: raw.set_at ?? null,
    start_date: raw.start_date ?? null,
    brief_id: raw.brief_id ?? null,
  };
}

/** Keeps only allowed keys, merges duplicates, and rounds to whole percents summing to 100 (even split if empty). */
export function normalize(items: Share[], allowed: string[]): Share[] {
  if (!allowed.length) return [];
  const m = new Map<string, number>();
  for (const it of items) if (allowed.includes(it.key)) m.set(it.key, (m.get(it.key) ?? 0) + Math.max(0, Number(it.share) || 0));
  let total = [...m.values()].reduce((x, y) => x + y, 0);
  if (total <= 0) {
    allowed.forEach((k) => m.set(k, 1));
    total = allowed.length;
  }
  const exact = allowed.map((k) => ({ key: k, v: ((m.get(k) ?? 0) / total) * 100 }));
  const out = exact.map((e) => ({ key: e.key, share: Math.floor(e.v) }));
  let left = 100 - out.reduce((x, y) => x + y.share, 0);
  for (const i of exact.map((e, i) => ({ i, r: e.v - Math.floor(e.v) })).sort((x, y) => y.r - x.r).map((x) => x.i)) {
    if (left-- <= 0) break;
    out[i].share++;
  }
  return out.filter((o) => o.share > 0);
}

export function describeMix(m: Mix) {
  const pct = (xs: Share[], label: (k: string) => string) => xs.map((x) => `${label(x.key)} ${x.share}%`).join(", ");
  return [
    m.feed_formats.length > 1 ? `Feed posts: ${pct(m.feed_formats, (k) => k)}` : "",
    `Art styles: ${pct(m.art_styles, styleLabel)}`,
    m.focus ? `Focus: ${m.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Smooth weighted round-robin: spreads the shares evenly over the slots instead of bunching them. */
function sequence(shares: Share[], slots: number): string[] {
  const total = shares.reduce((x, y) => x + y.share, 0);
  const cur = new Map(shares.map((s) => [s.key, 0]));
  const out: string[] = [];
  for (let i = 0; i < slots && total > 0; i++) {
    let best = shares[0].key;
    for (const s of shares) {
      cur.set(s.key, cur.get(s.key)! + s.share);
      if (cur.get(s.key)! > cur.get(best)!) best = s.key;
    }
    cur.set(best, cur.get(best)! - total);
    out.push(best);
  }
  return out;
}

/** What the mix asks of one scripting day: feed formats (exact) and an art style per piece. Null without a mix. */
export async function dayMix(a: Account, date: string): Promise<{ feed: string[]; styles: string[]; focus: string } | null> {
  const m = await currentMix(a);
  if (!m.set_at || !m.start_date) return null;
  const days = Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${m.start_date}T12:00:00Z`).getTime()) / 86400_000);
  const idx = ((days % 7) + 7) % 7;
  const posts = a.posts_per_day;
  const pieces = a.reels_per_day + a.posts_per_day;
  return {
    feed: m.feed_formats.length > 1 ? sequence(m.feed_formats, 7 * posts).slice(idx * posts, idx * posts + posts) : [],
    styles: m.art_styles.length ? sequence(m.art_styles, 7 * pieces).slice(idx * pieces, idx * pieces + pieces) : [],
    focus: m.focus,
  };
}

// ---------------------------------------------------------------------------
// Saving the agents' output

type AnalysisOut = { headline: string; recommendations: { area: string; recommendation: string; evidence: string; priority: string }[] } & Json;

export async function applyAnalysis(job: Job, data: unknown): Promise<string> {
  const out = data as AnalysisOut;
  if (!out?.headline || !Array.isArray(out.recommendations)) throw new Error("Analyst output is missing the headline or recommendations");
  const { start, end, stats } = await windowData(job.account_id!);
  await sql.run(
    "INSERT INTO reports (account_id, kind, job_id, period_start, period_end, data, stats) VALUES (?, 'analysis', ?, ?, ?, ?, ?)",
    job.account_id,
    job.id,
    start,
    end,
    JSON.stringify(out),
    JSON.stringify(stats),
  );
  return `${out.headline} · ${out.recommendations.length} recommendation${out.recommendations.length === 1 ? "" : "s"} for the Strategist`;
}

type BriefOut = {
  headline: string;
  mix: { feed_formats: { format: string; share_percent: number }[]; art_styles: { art_style: string; share_percent: number }[]; focus: string; reason: string };
} & Json;

export async function applyBrief(job: Job, data: unknown): Promise<string> {
  const out = data as BriefOut;
  if (!out?.headline || !out.mix) throw new Error("Manager output is missing the headline or the mix");
  const a = (await q.account(job.account_id!))!;
  const before = await currentMix(a);
  const feedAllowed: string[] = a.formats.filter((f) => f === "carousel" || f === "post");
  const stylesAllowed = a.art_styles.length ? a.art_styles : ["ghibli"];
  const asked = {
    feed: (out.mix.feed_formats ?? []).map((f) => ({ key: f.format, share: f.share_percent })),
    styles: (out.mix.art_styles ?? []).map((s) => ({ key: s.art_style, share: s.share_percent })),
  };
  const ignored = [
    ...asked.feed.filter((f) => !feedAllowed.includes(f.key)).map((f) => `format "${f.key}"`),
    ...asked.styles.filter((s) => !stylesAllowed.includes(s.key)).map((s) => `art style "${s.key}"`),
  ];
  const next: Mix = {
    feed_formats: normalize(asked.feed, feedAllowed),
    art_styles: normalize(asked.styles, stylesAllowed),
    focus: cut(out.mix.focus, 300),
    reason: cut(out.mix.reason, 600),
    set_at: new Date().toISOString(),
    start_date: addDays(todayLocal(), 1),
    brief_id: null,
  };

  const changes: string[] = [];
  const pct = (xs: Share[], key: string) => xs.find((x) => x.key === key)?.share ?? 0;
  const diff = (label: string, a0: Share[], b: Share[], name: (k: string) => string) => {
    const keys = [...new Set([...a0, ...b].map((x) => x.key))];
    const moved = keys.filter((k) => pct(a0, k) !== pct(b, k));
    if (moved.length) changes.push(`${label}: ${moved.map((k) => `${name(k)} ${pct(a0, k)}% → ${pct(b, k)}%`).join(", ")}`);
  };
  if (feedAllowed.length > 1) diff(before.set_at ? "Feed posts" : "Feed posts (from an even split)", before.feed_formats, next.feed_formats, (k) => k);
  diff(before.set_at ? "Art styles" : "Art styles (from an even split)", before.art_styles, next.art_styles, styleLabel);
  if (next.focus && next.focus !== before.focus) changes.push(`Strategist focus: ${next.focus}`);
  if (!changes.length) changes.push("Kept last week's mix.");
  if (ignored.length) changes.push(`Ignored (not enabled by you): ${ignored.join(", ")}.`);

  const { start, end, stats } = await windowData(a.id);
  const r = await sql.run(
    "INSERT INTO reports (account_id, kind, job_id, period_start, period_end, data, stats, changes) VALUES (?, 'brief', ?, ?, ?, ?, ?, ?)",
    a.id,
    job.id,
    start,
    end,
    JSON.stringify(out),
    JSON.stringify(stats),
    JSON.stringify(changes),
  );
  next.brief_id = r.lastRowId;
  await q.setSetting(`mix:${a.id}`, JSON.stringify(next));
  return `${out.headline} · ${changes.length} mix change${changes.length === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// What the Strategist sees

/** Latest Analyst recommendations + the Manager's focus, for the Strategist's prompts. "" before the first report. */
export async function resultsBlock(accountId: number): Promise<string> {
  const r = await latestReport(accountId, "analysis");
  if (!r) return "";
  const d = r.data as AnalysisOut & { best?: { content_id: number; title: string; numbers: string; why: string }[]; worst?: { content_id: number; title: string; numbers: string; why: string }[] };
  const brief = await latestReport(accountId, "brief");
  const focus = (brief?.data as BriefOut | undefined)?.mix?.focus;
  const lines = [
    `RESULTS SO FAR (the Analyst's report for ${prettyDate(r.period_start)} – ${prettyDate(r.period_end)}; real Instagram numbers — let them steer what you write)`,
    d.headline,
    "Recommendations:",
    ...d.recommendations.map((x) => `- [${x.priority} · ${x.area}] ${x.recommendation} (${x.evidence})`),
  ];
  if (d.best?.length) lines.push("Best pieces (do more like these):", ...d.best.map((b) => `- "${b.title}" — ${b.numbers} — ${b.why}`));
  if (d.worst?.length) lines.push("Weakest pieces (avoid what sank them):", ...d.worst.map((b) => `- "${b.title}" — ${b.numbers} — ${b.why}`));
  if (focus) lines.push(`The Manager's focus for this week: ${focus}`);
  return lines.join("\n");
}
