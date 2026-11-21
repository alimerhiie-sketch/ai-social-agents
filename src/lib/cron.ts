import { q, sql, pinD1 } from "./db";
import { isoDate, todayLocal, TZ } from "./dates";
import { captionFor, nextSlot } from "./publish/schedule";
import * as graph from "./publish/instagram";
import * as composio from "./publish/composio";
import * as tiktok from "./publish/tiktok";
import type { IgMedia } from "./publish/instagram";
import type { Connection, Post } from "./types";
import { signedMediaUrl } from "./auth";
import { enqueueCycle, enqueueProduce, markContentPostedIfDone, pinEnv, wakeRunner, type HqEnv } from "./queue";
import { enqueueWeeklyDevelop } from "./agents/upgrades";
import { collectMetrics } from "./analytics/collect";
import { enqueueWeeklyReview } from "./analytics/review";

// Runs every 5 minutes on Cloudflare (worker.ts → scheduled). This is what replaces the laptop:
//  1. post whatever Instagram posts are due (two-phase: create container → publish when processed)
//  2. read Instagram insights of posted pieces at 1h / 24h / 72h / 7d, and the account once a day
//  3. once a night: weekly review (Sundays), find trends, script the coming days, produce, schedule
//  4. wake the GitHub Actions runner if there's work it can do

const NIGHTLY_HOUR = 3; // 03:00 in the owner's time zone
/** A post this late (cron outage, or it sat on the phone page) is not sent on its own: press Retry now to send it anyway. */
const MAX_LATE_MS = 6 * 3600_000;

export async function runCron(env: HqEnv & { DB: unknown }) {
  pinD1(env.DB as never);
  pinEnv(env);
  const notes: string[] = [];
  try {
    notes.push(...(await publishDue()));
  } catch (e) {
    notes.push(`publish error: ${(e as Error).message}`);
  }
  try {
    notes.push(...(await collectMetrics()));
  } catch (e) {
    notes.push(`insights error: ${(e as Error).message}`);
  }
  try {
    notes.push(...(await nightly()));
  } catch (e) {
    notes.push(`nightly error: ${(e as Error).message}`);
  }
  try {
    notes.push(`runner: ${await wakeRunner("cron")}`);
  } catch (e) {
    notes.push(`runner error: ${(e as Error).message}`);
  }
  await q.setSetting("cron:last", JSON.stringify({ at: new Date().toISOString(), notes }));
  return notes;
}

// ---------------------------------------------------------------------------

async function publishDue(): Promise<string[]> {
  const origin = await q.setting("public_url", "");
  if (!origin) return ["publish: waiting for the dashboard's public URL (open the dashboard once)"];
  const now = new Date().toISOString();
  const due = await sql.all<Post & { container_id: string | null; container_at: string | null }>(
    `SELECT * FROM posts
     WHERE method = 'api' AND platform IN ('instagram','tiktok') AND scheduled_at <= ? AND status IN ('scheduled','publishing')
     ORDER BY scheduled_at LIMIT 5`,
    now,
  );
  const out: string[] = [];
  for (const p of due) {
    const label = p.platform === "tiktok" ? "TikTok" : "Instagram";
    try {
      const c = await q.contentItem(p.content_id);
      const a = await q.account(p.account_id);
      if (!c?.media || !a) throw new Error("The piece or its media is missing");
      let conn = await q.connection(a.id, p.platform);
      if (!conn) throw new Error(`${label} isn't connected for this account`);

      if (p.platform === "instagram" && conn.provider !== "composio" && Date.now() - new Date(conn.refreshed_at ?? 0).getTime() > 7 * 86400_000) {
        try {
          const r = await graph.refreshToken(conn.token);
          await sql.run(
            "UPDATE connections SET token = ?, expires_at = ?, refreshed_at = ? WHERE account_id = ? AND platform = 'instagram'",
            r.token,
            r.expiresAt,
            new Date().toISOString(),
            a.id,
          );
          conn = (await q.connection(a.id, "instagram"))!;
        } catch {}
      }
      const pub = publisher(conn, p, c.media.kind === "reel");

      if (!p.container_id) {
        if (Date.now() - new Date(p.scheduled_at).getTime() > MAX_LATE_MS)
          throw new Error("Missed its slot by more than 6 hours, so it wasn't sent automatically. Press Retry now to post it anyway.");
        const m = c.media;
        const url = (f: string) => signedMediaUrl(origin, `${m.dir}/${f}`);
        const media: IgMedia =
          m.kind === "reel"
            ? { kind: "reel", video: await url(m.files[0]), cover: m.cover ? await url(m.cover) : undefined }
            : m.files.length === 1
              ? { kind: "image", image: await url(m.files[0]) }
              : { kind: "carousel", images: await Promise.all(m.files.map(url)) };
        const id = await pub.create(media, captionFor(a, c), m.durationSeconds);
        await sql.run("UPDATE posts SET status = 'publishing', container_id = ?, container_at = ?, error = NULL WHERE id = ?", id, now, p.id);
        out.push(`post #${p.id}: ${label} ${id} started (${conn.provider})`);
        continue;
      }

      // A failed status check (network blip, Composio hiccup) just waits for the next tick.
      const st: Check = await pub.check(p.container_id).catch((e: Error) => ({ state: "pending" as const, detail: `check failed: ${e.message}` }));
      let done: { mediaId: string; permalink: string } | null = null;
      if (st.state === "ready") done = await pub.publish(p.container_id);
      else if (st.state === "done") done = { mediaId: st.mediaId ?? "", permalink: st.permalink ?? "" };
      if (done) {
        await sql.run(
          "UPDATE posts SET status = 'posted', posted_at = ?, remote_id = ?, permalink = ?, error = NULL WHERE id = ?",
          new Date().toISOString(),
          done.mediaId,
          done.permalink,
          p.id,
        );
        await markContentPostedIfDone(c.id);
        out.push(`post #${p.id}: ${label} published ${done.permalink}`);
      } else if (st.state === "error") {
        throw new Error(st.detail);
      } else if (Date.now() - new Date(p.container_at ?? now).getTime() > 45 * 60_000) {
        throw new Error(`${label} was still processing after 45 minutes (${st.detail})`);
      } else out.push(`post #${p.id}: ${label} processing (${st.detail})`);
    } catch (e) {
      await sql.run("UPDATE posts SET status = 'failed', container_id = NULL, error = ? WHERE id = ?", (e as Error).message, p.id);
      out.push(`post #${p.id}: failed — ${(e as Error).message}`);
    }
  }
  return out;
}

type Check = { state: "ready" | "done" | "pending" | "error"; detail: string; mediaId?: string; permalink?: string };

/**
 * The same steps for every route: create (start processing), check (on later ticks), publish (Instagram
 * only; TikTok publishes by itself once processed). Instagram goes through our own Meta token or
 * Composio; TikTok always through Composio.
 */
function publisher(conn: Connection, post: { tiktok_options: string | null }, isVideo: boolean) {
  const cc: composio.ComposioConn = { connectedAccountId: conn.provider_account_id ?? "", userId: conn.provider_user_id ?? "", igUserId: conn.remote_user_id };
  const igCheck = (s: { code: string; detail: string }): Check =>
    s.code === "FINISHED"
      ? { state: "ready", detail: s.code }
      : s.code === "ERROR" || s.code === "EXPIRED"
        ? { state: "error", detail: `Instagram could not process the media: ${s.detail || s.code}` }
        : { state: "pending", detail: s.code || "processing" };

  if (conn.platform === "tiktok") {
    return {
      create: async (m: IgMedia, _caption: string, seconds: number) => {
        if (!post.tiktok_options) throw new Error("Choose this post's TikTok settings first (open it from the Schedule page).");
        return tiktok.startPost(cc, m, JSON.parse(post.tiktok_options) as tiktok.TikTokOptions, seconds);
      },
      check: async (id: string): Promise<Check> => tiktok.postStatus(cc, id, conn.username, isVideo),
      publish: async (): Promise<{ mediaId: string; permalink: string }> => {
        throw new Error("TikTok publishes on its own");
      },
    };
  }
  if (conn.provider === "composio") {
    return {
      create: (m: IgMedia, caption: string) => composio.createContainer(cc, m, caption),
      check: async (id: string) => igCheck(await composio.containerStatus(cc, id)),
      publish: (id: string) => composio.publishContainer(cc, id),
    };
  }
  return {
    create: (m: IgMedia, caption: string) => graph.createContainer(conn.remote_user_id, conn.token, m, caption),
    check: async (id: string) => igCheck(await graph.containerStatus(id, conn.token)),
    publish: (id: string) => graph.publishContainer(conn.remote_user_id, conn.token, id),
  };
}

// ---------------------------------------------------------------------------

function localHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}

async function nightly(): Promise<string[]> {
  const today = todayLocal();
  if (localHour() < NIGHTLY_HOUR || (await q.setting("nightly:last", "")) === today) return [];
  await q.setSetting("nightly:last", today);
  const out: string[] = [];
  for (const a of await q.accounts()) {
    // Sundays: the Analyst reviews the week, then the Manager writes the brief and sets next week's mix.
    // Queued first so they run before the scripting jobs below and those see the new mix.
    if ((await enqueueWeeklyReview(a.id)).length) out.push(`${a.name}: queued the weekly analysis + Manager brief`);
    // Strategist + Trend Scout keep a week of scripts ahead (skips days that are already full).
    const ids = await enqueueCycle(a.id);
    out.push(`${a.name}: queued ${ids.length} planning jobs`);
    // Once a week the Agent Developer proposes upgrades for the other agents (applied only when you approve).
    if (await enqueueWeeklyDevelop(a.id)) out.push(`${a.name}: queued the weekly Agent Developer run`);
    // Produce everything you've approved.
    for (const c of await q.content({ accountId: a.id, status: "approved", limit: 100 })) await enqueueProduce(c.id);
    // Schedule everything you've signed off as ready to post.
    for (const c of await q.content({ accountId: a.id, status: "ready", limit: 100 })) {
      if (!c.media) continue;
      const at = await nextSlot(a, c);
      const igApi = !!(await q.connection(a.id, "instagram"));
      const want = (c.platform === "both" ? ["instagram", "tiktok"] : [c.platform]).filter((p) => a.platforms.includes(p));
      for (const platform of want)
        await sql.run(
          "INSERT INTO posts (content_id, account_id, platform, method, status, scheduled_at) VALUES (?, ?, ?, ?, 'scheduled', ?)",
          c.id,
          a.id,
          platform,
          platform === "instagram" && igApi ? "api" : "phone",
          at,
        );
      if (want.length) await sql.run("UPDATE content SET status = 'scheduled', updated_at = datetime('now') WHERE id = ?", c.id);
    }
  }
  out.push(...(await cleanupMedia()));
  return out;
}

/** Free KV space: drop the media of pieces posted more than 7 days ago (they live on Instagram/TikTok now). */
async function cleanupMedia(): Promise<string[]> {
  const old = await sql.all<{ id: number; media: string }>(
    `SELECT c.id, c.media FROM content c WHERE c.status = 'posted' AND c.media IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.content_id = c.id AND (p.posted_at IS NULL OR p.posted_at > ?))`,
    new Date(Date.now() - 7 * 86400_000).toISOString(),
  );
  if (!old.length) return [];
  const { env } = await import("./queue");
  const kv = (await env()).MEDIA;
  for (const c of old) {
    const dir = (JSON.parse(c.media) as { dir: string }).dir;
    const page = await kv.list({ prefix: `media/${dir}/` });
    for (const k of page.keys) await kv.delete(k.name);
    await sql.run("UPDATE content SET media = NULL WHERE id = ?", c.id);
  }
  return [`cleaned media of ${old.length} posted piece(s)`, `(today ${isoDate(new Date())})`];
}
