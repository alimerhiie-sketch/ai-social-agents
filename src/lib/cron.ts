import { q, sql, pinD1 } from "./db";
import { isoDate, todayLocal, TZ } from "./dates";
import { captionFor, nextSlot } from "./publish/schedule";
import { containerStatus, createContainer, publishContainer, refreshToken, type IgMedia } from "./publish/instagram";
import { signedMediaUrl } from "./auth";
import { enqueueCycle, enqueueProduce, markContentPostedIfDone, pinEnv, wakeRunner, type HqEnv } from "./queue";

// Runs every 5 minutes on Cloudflare (worker.ts → scheduled). This is what replaces the laptop:
//  1. post whatever Instagram posts are due (two-phase: create container → publish when processed)
//  2. once a night: find trends, script the coming days, produce approved pieces, schedule finished ones
//  3. wake the GitHub Actions runner if there's work it can do

const NIGHTLY_HOUR = 3; // 03:00 in the owner's time zone

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
  const due = await sql.all<{ id: number; content_id: number; account_id: number; status: string; container_id: string | null; container_at: string | null }>(
    `SELECT id, content_id, account_id, status, container_id, container_at FROM posts
     WHERE method = 'api' AND platform = 'instagram' AND scheduled_at <= ? AND status IN ('scheduled','publishing')
     ORDER BY scheduled_at LIMIT 5`,
    now,
  );
  const out: string[] = [];
  for (const p of due) {
    try {
      const c = await q.contentItem(p.content_id);
      const a = await q.account(p.account_id);
      if (!c?.media || !a) throw new Error("The piece or its media is missing");
      let conn = await q.connection(a.id, "instagram");
      if (!conn) throw new Error("Instagram isn't connected for this account");

      if (Date.now() - new Date(conn.refreshed_at ?? 0).getTime() > 7 * 86400_000) {
        try {
          const r = await refreshToken(conn.token);
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

      if (!p.container_id) {
        const m = c.media;
        const url = (f: string) => signedMediaUrl(origin, `${m.dir}/${f}`);
        const media: IgMedia =
          m.kind === "reel"
            ? { kind: "reel", video: await url(m.files[0]), cover: m.cover ? await url(m.cover) : undefined }
            : m.files.length === 1
              ? { kind: "image", image: await url(m.files[0]) }
              : { kind: "carousel", images: await Promise.all(m.files.map(url)) };
        const id = await createContainer(conn.remote_user_id, conn.token, media, captionFor(a, c));
        await sql.run("UPDATE posts SET status = 'publishing', container_id = ?, container_at = ?, error = NULL WHERE id = ?", id, now, p.id);
        out.push(`post #${p.id}: container ${id} created`);
        continue;
      }

      const st = await containerStatus(p.container_id, conn.token);
      if (st.code === "FINISHED") {
        const r = await publishContainer(conn.remote_user_id, conn.token, p.container_id);
        await sql.run(
          "UPDATE posts SET status = 'posted', posted_at = ?, remote_id = ?, permalink = ?, error = NULL WHERE id = ?",
          new Date().toISOString(),
          r.mediaId,
          r.permalink,
          p.id,
        );
        await markContentPostedIfDone(c.id);
        out.push(`post #${p.id}: published ${r.permalink}`);
      } else if (st.code === "ERROR" || st.code === "EXPIRED") {
        throw new Error(`Instagram could not process the media: ${st.detail || st.code}`);
      } else if (Date.now() - new Date(p.container_at ?? now).getTime() > 45 * 60_000) {
        throw new Error("Instagram was still processing after 45 minutes");
      } else out.push(`post #${p.id}: processing (${st.code})`);
    } catch (e) {
      await sql.run("UPDATE posts SET status = 'failed', container_id = NULL, error = ? WHERE id = ?", (e as Error).message, p.id);
      out.push(`post #${p.id}: failed — ${(e as Error).message}`);
    }
  }
  return out;
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
    // Strategist + Trend Scout keep a week of scripts ahead (skips days that are already full).
    const ids = await enqueueCycle(a.id);
    out.push(`${a.name}: queued ${ids.length} planning jobs`);
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
