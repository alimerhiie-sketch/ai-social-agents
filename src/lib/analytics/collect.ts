import { q, sql } from "../db";
import { addDays, todayLocal, TZ, zonedIso } from "../dates";
import * as composio from "../publish/composio";
import type { Connection } from "../types";

// The Analyst's data collection, run by the Worker cron (src/lib/cron.ts) every 5 minutes. It does nothing on
// most ticks: a post is read at about 1h, 24h, 72h and 7 days after it went out, and each account once a day.
// Everything goes through Composio's Instagram tools, batched into one Composio call per account per tick,
// which keeps the free plan's monthly call budget safe (~4 calls per post + 3 per account per day).
//
// TikTok: not connected yet (its posts go out by hand from the phone page), so there is nothing to read.
// When it is connected through Composio, add a TikTok branch here keyed on conn.platform; the tables already
// carry a platform column.

type Json = Record<string, unknown>;

export const CHECKPOINTS = [
  { key: "1h", hours: 1 },
  { key: "24h", hours: 24 },
  { key: "72h", hours: 72 },
  { key: "7d", hours: 168 },
] as const;

/** Instagram rejects follows/profile_visits on reels and the reel metrics on feed posts. */
const REEL_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"];
const FEED_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "follows", "profile_visits"];
const BASIC_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"];

const COLUMN: Record<string, string> = {
  views: "views",
  reach: "reach",
  likes: "likes",
  comments: "comments",
  saved: "saves",
  shares: "shares",
  total_interactions: "interactions",
  follows: "follows",
  profile_visits: "profile_visits",
  ig_reels_avg_watch_time: "avg_watch_ms",
  ig_reels_video_view_total_time: "total_watch_ms",
  reels_skip_rate: "skip_rate",
};

const MAX_POSTS_PER_TICK = 25;
const ACCOUNT_SNAPSHOT_HOUR = 1; // the day before is complete by 01:00 Beirut

/** Metric name → value from an insights response ({data: [{name, values: [{value}]} | {name, total_value: {value}}]}). */
export function insightValues(d: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const list = composio.pickAny(d, "data");
  const rows = Array.isArray(list) ? list : Array.isArray((list as Json)?.data) ? ((list as Json).data as unknown[]) : [];
  for (const r of rows as Json[]) {
    if (!r || typeof r.name !== "string") continue;
    const tv = (r.total_value as Json | undefined)?.value;
    const v = tv ?? ((r.values as Json[] | undefined)?.at(-1)?.value as unknown);
    if (typeof v === "number") out[r.name] = v;
  }
  return out;
}

const connOf = (c: Connection): composio.ComposioConn => ({ connectedAccountId: c.provider_account_id ?? "", userId: c.provider_user_id ?? "", igUserId: c.remote_user_id });

function localHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}

export async function collectMetrics(opts: { force?: boolean } = {}): Promise<string[]> {
  const out: string[] = [];
  for (const a of await q.accounts()) {
    const conn = await q.connection(a.id, "instagram");
    if (!conn) continue;
    if (conn.provider !== "composio") {
      out.push(`${a.name}: insights need the Composio Instagram connection`);
      continue;
    }
    try {
      out.push(...(await collectPosts(a.id, conn)));
    } catch (e) {
      out.push(`${a.name}: post insights error — ${(e as Error).message}`);
    }
    try {
      const r = await collectAccount(a.id, conn, !!opts.force);
      if (r) out.push(`${a.name}: ${r}`);
    } catch (e) {
      out.push(`${a.name}: account insights error — ${(e as Error).message}`);
    }
  }
  return out;
}

/** Posts whose next checkpoint is due. A post read late (or for the first time) is stored under the latest
 *  checkpoint it has passed, with its real age, and earlier missed checkpoints are skipped. */
async function collectPosts(accountId: number, conn: Connection): Promise<string[]> {
  const now = Date.now();
  const rows = await sql.all<{ id: number; remote_id: string; posted_at: string; format: string; done: string | null }>(
    `SELECT p.id, p.remote_id, p.posted_at, c.format,
       (SELECT GROUP_CONCAT(m.checkpoint) FROM post_metrics m WHERE m.post_id = p.id) AS done
     FROM posts p JOIN content c ON c.id = p.content_id
     WHERE p.account_id = ? AND p.platform = 'instagram' AND p.status = 'posted'
       AND p.remote_id IS NOT NULL AND p.remote_id != '' AND p.posted_at > ?
     ORDER BY p.posted_at`,
    accountId,
    new Date(now - 10 * 86400_000).toISOString(),
  );
  const due: { id: number; media: string; reel: boolean; checkpoint: string; age: number }[] = [];
  for (const r of rows) {
    const age = (now - new Date(r.posted_at).getTime()) / 3600_000;
    const done = new Set((r.done ?? "").split(",").filter(Boolean));
    const passed = CHECKPOINTS.filter((c) => age >= c.hours);
    const latest = passed.at(-1);
    if (!latest || done.has(latest.key)) continue;
    // A later checkpoint already stored means this one was skipped on purpose.
    if (CHECKPOINTS.some((c) => c.hours > latest.hours && done.has(c.key))) continue;
    due.push({ id: r.id, media: r.remote_id, reel: r.format === "reel", checkpoint: latest.key, age });
  }
  if (!due.length) return [];
  const batch = due.slice(0, MAX_POSTS_PER_TICK);
  const cc = connOf(conn);
  const call = (d: (typeof batch)[number], metrics: string[]) => ({ slug: "INSTAGRAM_GET_IG_MEDIA_INSIGHTS", args: { ig_media_id: d.media, metric: metrics } });
  const res = await composio.runMany(cc, batch.map((d) => call(d, d.reel ? REEL_METRICS : FEED_METRICS)), "Agent HQ: reading insights of the owner's own posts");

  // A metric Instagram doesn't support for that media type fails the whole request: retry with the basics.
  const retry = batch.map((d, i) => ({ d, i })).filter(({ i }) => !res[i].ok && /not (compatible|support)/i.test((res[i] as { error: string }).error));
  if (retry.length) {
    const again = await composio.runMany(cc, retry.map(({ d }) => call(d, BASIC_METRICS)), "Agent HQ: reading insights of the owner's own posts");
    retry.forEach(({ i }, j) => (res[i] = again[j]));
  }

  let ok = 0;
  for (let i = 0; i < batch.length; i++) {
    const d = batch[i];
    const r = res[i];
    const v = r.ok ? insightValues(r.data) : {};
    const cols = Object.entries(COLUMN).map(([metric, col]) => [col, v[metric] ?? null] as const);
    await sql.run(
      `INSERT INTO post_metrics (post_id, account_id, platform, checkpoint, age_hours, ${cols.map((c) => c[0]).join(", ")}, error, raw)
       VALUES (?, ?, 'instagram', ?, ?, ${cols.map(() => "?").join(", ")}, ?, ?)
       ON CONFLICT(post_id, checkpoint) DO NOTHING`,
      d.id,
      accountId,
      d.checkpoint,
      Math.round(d.age * 10) / 10,
      ...cols.map((c) => c[1]),
      r.ok ? null : r.error.slice(0, 500),
      r.ok ? JSON.stringify(v) : null,
    );
    if (r.ok) ok++;
  }
  return [`insights: ${ok}/${batch.length} post(s) read (${[...new Set(batch.map((d) => d.checkpoint))].join(", ")})`];
}

/** Once a day: follower count now, plus yesterday's account totals. */
async function collectAccount(accountId: number, conn: Connection, force: boolean): Promise<string | null> {
  const day = addDays(todayLocal(), -1);
  const key = `metrics:account:${accountId}`;
  if (!force && (localHour() < ACCOUNT_SNAPSHOT_HOUR || (await q.setting(key, "")) === day)) return null;
  const since = Math.floor(new Date(zonedIso(day, "00:00")).getTime() / 1000);
  const until = Math.floor(new Date(zonedIso(todayLocal(), "00:00")).getTime() / 1000);
  const cc = connOf(conn);
  const [info, totals, follows] = await composio.runMany(
    cc,
    [
      { slug: "INSTAGRAM_GET_USER_INFO", args: { ig_user_id: "me", fields: "id,user_id,username,followers_count,follows_count,media_count" } },
      {
        slug: "INSTAGRAM_GET_USER_INSIGHTS",
        args: { metric: ["reach", "views", "profile_views", "accounts_engaged", "total_interactions"], period: "day", metric_type: "total_value", since, until },
      },
      // Empty until the account has activity; Instagram omits it rather than erroring.
      {
        slug: "INSTAGRAM_GET_USER_INSIGHTS",
        args: { metric: ["follows_and_unfollows"], period: "day", metric_type: "total_value", breakdown: "follow_type", since, until },
      },
    ],
    "Agent HQ: daily snapshot of the owner's own account",
  );
  if (!info.ok) throw new Error(info.error);
  const num = (v: string) => (v === "" ? null : Number(v));
  const t = totals.ok ? insightValues(totals.data) : {};
  let gained: number | null = null;
  let lost: number | null = null;
  if (follows.ok) {
    const results = composio.pickAny(follows.data, "results");
    for (const b of Array.isArray(results) ? (results as Json[]) : []) {
      const dim = String((b.dimension_values as string[] | undefined)?.[0] ?? "").toUpperCase();
      if (dim === "FOLLOWER") gained = Number(b.value) || 0;
      else if (dim === "NON_FOLLOWER") lost = Number(b.value) || 0;
    }
  }
  const followers = num(composio.pickField(info.data, "followers_count"));
  await sql.run(
    `INSERT INTO account_metrics (account_id, platform, date, followers, following, media_count, reach, views, profile_views, accounts_engaged, interactions, follows, unfollows, raw)
     VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, platform, date) DO UPDATE SET followers = excluded.followers, following = excluded.following,
       media_count = excluded.media_count, reach = excluded.reach, views = excluded.views, profile_views = excluded.profile_views,
       accounts_engaged = excluded.accounts_engaged, interactions = excluded.interactions, follows = excluded.follows,
       unfollows = excluded.unfollows, raw = excluded.raw, fetched_at = datetime('now')`,
    accountId,
    day,
    followers,
    num(composio.pickField(info.data, "follows_count")),
    num(composio.pickField(info.data, "media_count")),
    t.reach ?? null,
    t.views ?? null,
    t.profile_views ?? null,
    t.accounts_engaged ?? null,
    t.total_interactions ?? null,
    gained,
    lost,
    JSON.stringify({ totals: t, totals_error: totals.ok ? undefined : totals.error, follows_error: follows.ok ? undefined : follows.error }),
  );
  await q.setSetting(key, day);
  return `account snapshot for ${day}: ${followers ?? "?"} followers, ${t.views ?? "?"} views`;
}
