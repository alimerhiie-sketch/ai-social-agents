"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { cancel, enqueue, enqueueCycle, enqueuePlanWeek, enqueueProduce, markContentPostedIfDone, wakeRunner } from "@/lib/queue";
import { nextSlot } from "@/lib/publish/schedule";
import { MODELS } from "@/lib/options";
import type { JobKind } from "@/lib/types";

// Every action checks the session first: the dashboard is on the public internet, and server actions
// can be called directly. Actions that queue work also wake the GitHub runner straight away.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const clampInt = (v: string, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const many = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);
const wake = (why: string) => wakeRunner(why).catch(() => "");

function accountFields(fd: FormData) {
  const colors = s(fd, "brand_colors")
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c))
    .map((c) => (c.startsWith("#") ? c : `#${c}`));
  return {
    name: s(fd, "name") || "Untitled account",
    niche: s(fd, "niche"),
    description: s(fd, "description"),
    audience: s(fd, "audience"),
    language: s(fd, "language") || "English",
    platforms: JSON.stringify(many(fd, "platforms")),
    ig_handle: s(fd, "ig_handle").replace(/^@/, ""),
    tiktok_handle: s(fd, "tiktok_handle").replace(/^@/, ""),
    tones: JSON.stringify(many(fd, "tones")),
    formats: JSON.stringify(many(fd, "formats")),
    video_styles: JSON.stringify(many(fd, "video_styles")),
    art_styles: JSON.stringify(many(fd, "art_styles")),
    character: s(fd, "character"),
    reel_times: s(fd, "reel_times") || "13:00, 20:00",
    post_times: s(fd, "post_times") || "09:30, 17:30",
    ai_disclosure: s(fd, "ai_disclosure"),
    reels_per_day: clampInt(s(fd, "reels_per_day"), 0, 6, 1),
    posts_per_day: clampInt(s(fd, "posts_per_day"), 0, 6, 1),
    posts_per_week: 7 * (clampInt(s(fd, "reels_per_day"), 0, 6, 1) + clampInt(s(fd, "posts_per_day"), 0, 6, 1)),
    approval_mode: "manual",
    brand_colors: JSON.stringify(colors),
    avoid: s(fd, "avoid"),
    inspiration: s(fd, "inspiration"),
  };
}

export async function createAccount(fd: FormData) {
  await requireAuth();
  const f = accountFields(fd);
  const keys = Object.keys(f);
  const r = await sql.run(`INSERT INTO accounts (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, ...Object.values(f));
  if (fd.get("start_strategy") === "on") {
    await enqueue("strategy", r.lastRowId);
    await wake("new account");
  }
  revalidatePath("/", "layout");
  redirect(`/accounts/${r.lastRowId}`);
}

export async function updateAccount(id: number, fd: FormData) {
  await requireAuth();
  const f = accountFields(fd);
  await sql.run(`UPDATE accounts SET ${Object.keys(f).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...Object.values(f), id);
  revalidatePath("/", "layout");
  redirect(`/accounts/${id}`);
}

export async function deleteAccount(id: number) {
  await requireAuth();
  await sql.run("DELETE FROM accounts WHERE id = ?", id);
  revalidatePath("/", "layout");
  redirect("/accounts");
}

export async function runJob(kind: JobKind, accountId: number) {
  await requireAuth();
  const id = await enqueue(kind, accountId);
  await wake(kind);
  revalidatePath("/", "layout");
  redirect(`/agents/jobs/${id}`);
}

export async function runPlanWeek(accountId: number) {
  await requireAuth();
  await enqueuePlanWeek(accountId);
  await wake("plan week");
  revalidatePath("/", "layout");
  redirect(`/agents`);
}

export async function runCycle(accountId: number) {
  await requireAuth();
  await enqueueCycle(accountId);
  await wake("weekly cycle");
  revalidatePath("/", "layout");
  redirect(`/agents`);
}

export async function contentFromTrend(trendId: number) {
  await requireAuth();
  const t = await q.trend(trendId);
  if (!t) return;
  const id = await enqueue("from-trend", t.account_id, { refId: trendId });
  await wake("from trend");
  revalidatePath("/", "layout");
  redirect(`/agents/jobs/${id}`);
}

export async function setTrendStatus(trendId: number, status: "new" | "dismissed") {
  await requireAuth();
  await sql.run("UPDATE trends SET status = ? WHERE id = ?", status, trendId);
  revalidatePath("/trends");
}

export async function setContentStatus(id: number, status: string, fd?: FormData) {
  await requireAuth();
  const feedback = fd ? s(fd, "feedback") : null;
  if (feedback !== null) await sql.run("UPDATE content SET status = ?, feedback = ?, updated_at = datetime('now') WHERE id = ?", status, feedback, id);
  else await sql.run("UPDATE content SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
  revalidatePath("/", "layout");
}

/** Approve every script waiting for review (optionally for one account). */
export async function approveAllScripted(accountId?: number) {
  await requireAuth();
  if (accountId) await sql.run("UPDATE content SET status = 'approved', updated_at = datetime('now') WHERE status = 'scripted' AND account_id = ?", accountId);
  else await sql.run("UPDATE content SET status = 'approved', updated_at = datetime('now') WHERE status = 'scripted'");
  revalidatePath("/", "layout");
}

/** Sign off every rendered piece in final review as ready to post. */
export async function approveAllReview(accountId?: number) {
  await requireAuth();
  if (accountId) await sql.run("UPDATE content SET status = 'ready', updated_at = datetime('now') WHERE status = 'review' AND account_id = ?", accountId);
  else await sql.run("UPDATE content SET status = 'ready', updated_at = datetime('now') WHERE status = 'review'");
  revalidatePath("/", "layout");
}

export async function updateContentText(id: number, fd: FormData) {
  await requireAuth();
  const hashtags = s(fd, "hashtags")
    .split(/[\s,]+/)
    .map((h) => h.replace(/^#/, ""))
    .filter(Boolean);
  await sql.run(
    "UPDATE content SET hook = ?, caption = ?, hashtags = ?, cta = ?, updated_at = datetime('now') WHERE id = ?",
    s(fd, "hook"),
    s(fd, "caption"),
    JSON.stringify(hashtags),
    s(fd, "cta"),
    id,
  );
  revalidatePath(`/pipeline/${id}`);
}

export async function deleteContent(id: number) {
  await requireAuth();
  await sql.run("DELETE FROM content WHERE id = ?", id);
  revalidatePath("/", "layout");
  redirect("/pipeline");
}

export async function cancelJob(id: number) {
  await requireAuth();
  await cancel(id);
  revalidatePath("/", "layout");
}

/** settingKey is `model:<agent>` or `model:<agent>:scripts`. */
export async function setAgentModel(settingKey: string, fd: FormData) {
  await requireAuth();
  const model = s(fd, "model");
  if (/^model:[a-z-]+(:scripts)?$/.test(settingKey) && MODELS.some((m) => m.id === model)) await q.setSetting(settingKey, model);
  revalidatePath("/agents");
}

// ---------- production ----------

export async function produce(contentId: number) {
  await requireAuth();
  const c = await q.contentItem(contentId);
  if (!c || !["approved", "review", "ready"].includes(c.status)) return;
  await enqueueProduce(contentId);
  await wake("produce");
  revalidatePath("/", "layout");
}

/** Throw away the scene plan and render, and produce from scratch (new images, new plan). */
export async function redoProduction(contentId: number, fd?: FormData) {
  await requireAuth();
  const note = fd ? s(fd, "feedback") : "";
  await sql.run(
    "UPDATE content SET production = NULL, media = NULL, status = 'approved', feedback = CASE WHEN ? != '' THEN ? ELSE feedback END, updated_at = datetime('now') WHERE id = ?",
    note,
    note,
    contentId,
  );
  await enqueueProduce(contentId);
  await wake("redo");
  revalidatePath("/", "layout");
}

export async function produceAllApproved(accountId?: number) {
  await requireAuth();
  for (const it of await q.content({ accountId, status: "approved", limit: 200 })) await enqueueProduce(it.id);
  await wake("produce all");
  revalidatePath("/", "layout");
  redirect("/agents");
}

// ---------- publishing ----------

export async function connectInstagram(accountId: number, fd: FormData) {
  await requireAuth();
  const token = s(fd, "token");
  if (!token) return;
  const { whoAmI } = await import("@/lib/publish/instagram");
  let me: { userId: string; username: string; accountType: string };
  try {
    me = await whoAmI(token);
  } catch (e) {
    await q.setSetting(`connect-error:${accountId}`, (e as Error).message);
    revalidatePath(`/accounts/${accountId}`);
    return;
  }
  await q.setSetting(`connect-error:${accountId}`, "");
  await sql.run(
    `INSERT INTO connections (account_id, platform, remote_user_id, username, token, expires_at, refreshed_at)
     VALUES (?, 'instagram', ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, platform) DO UPDATE SET remote_user_id = excluded.remote_user_id, username = excluded.username,
       token = excluded.token, expires_at = excluded.expires_at, refreshed_at = excluded.refreshed_at,
       provider = 'graph', provider_account_id = NULL, provider_user_id = NULL`,
    accountId,
    me.userId,
    me.username,
    token,
    new Date(Date.now() + 60 * 86400_000).toISOString(),
    new Date().toISOString(),
  );
  // Pieces already waiting to go out switch from the phone page to automatic posting.
  await sql.run("UPDATE posts SET method = 'api' WHERE account_id = ? AND platform = 'instagram' AND status = 'scheduled'", accountId);
  revalidatePath(`/accounts/${accountId}`);
}

/**
 * Links the account to its Instagram connection in Composio (made by logging in through Composio's
 * managed OAuth). Needs the COMPOSIO_API_KEY Worker secret. Picks the connection whose username matches
 * the account's Instagram handle.
 */
export async function connectComposio(accountId: number) {
  await requireAuth();
  const a = await q.account(accountId);
  if (!a) return;
  const fail = async (msg: string) => {
    await q.setSetting(`connect-error:${accountId}`, msg);
    revalidatePath(`/accounts/${accountId}`);
  };
  const { findInstagramConnections } = await import("@/lib/publish/composio");
  let found: Awaited<ReturnType<typeof findInstagramConnections>>;
  try {
    found = await findInstagramConnections();
  } catch (e) {
    return fail((e as Error).message);
  }
  const handle = a.ig_handle.toLowerCase();
  const pick = handle ? found.find((f) => f.username.toLowerCase() === handle) : found.length === 1 ? found[0] : undefined;
  if (!pick || !pick.igUserId)
    return fail(
      found.length
        ? `No active Composio Instagram connection for @${a.ig_handle || "?"} (found: ${found.map((f) => `@${f.username || "unknown"}`).join(", ")}).`
        : "Composio has no active Instagram connection in the project this API key belongs to.",
    );
  await q.setSetting(`connect-error:${accountId}`, "");
  await sql.run(
    `INSERT INTO connections (account_id, platform, remote_user_id, username, token, expires_at, refreshed_at, provider, provider_account_id, provider_user_id)
     VALUES (?, 'instagram', ?, ?, '', NULL, ?, 'composio', ?, ?)
     ON CONFLICT(account_id, platform) DO UPDATE SET remote_user_id = excluded.remote_user_id, username = excluded.username,
       token = '', expires_at = NULL, refreshed_at = excluded.refreshed_at, provider = 'composio',
       provider_account_id = excluded.provider_account_id, provider_user_id = excluded.provider_user_id`,
    accountId,
    pick.igUserId,
    pick.username,
    new Date().toISOString(),
    pick.connectedAccountId,
    pick.userId,
  );
  // Upcoming Instagram posts switch from the phone page to automatic posting. Ones already past their
  // slot stay on the phone page (they may have been posted by hand); Post now on the schedule sends one.
  await sql.run(
    "UPDATE posts SET method = 'api' WHERE account_id = ? AND platform = 'instagram' AND status = 'scheduled' AND scheduled_at >= ?",
    accountId,
    new Date().toISOString(),
  );
  revalidatePath("/", "layout");
}

/** Sends one overdue phone-page Instagram post through the API on the next cron tick. */
export async function sendViaApi(postId: number) {
  await requireAuth();
  const p = await q.post(postId);
  if (!p || p.platform !== "instagram" || p.status !== "scheduled" || !(await q.connection(p.account_id, "instagram"))) return;
  await sql.run("UPDATE posts SET method = 'api', scheduled_at = ?, container_id = NULL, error = NULL WHERE id = ?", new Date().toISOString(), postId);
  revalidatePath("/", "layout");
}

export async function disconnect(accountId: number, platform: string) {
  await requireAuth();
  await sql.run("DELETE FROM connections WHERE account_id = ? AND platform = ?", accountId, platform);
  await sql.run("UPDATE posts SET method = 'phone' WHERE account_id = ? AND platform = ? AND status = 'scheduled'", accountId, platform);
  revalidatePath(`/accounts/${accountId}`);
}

async function scheduleOne(contentId: number) {
  const c = await q.contentItem(contentId);
  if (!c || c.status !== "ready" || !c.media) return 0;
  const a = await q.account(c.account_id);
  if (!a) return 0;
  const want = (c.platform === "both" ? ["instagram", "tiktok"] : [c.platform]).filter((p) => a.platforms.includes(p));
  const igApi = !!(await q.connection(a.id, "instagram"));
  const at = await nextSlot(a, c);
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
  return want.length;
}

export async function scheduleContent(contentId: number) {
  await requireAuth();
  await scheduleOne(contentId);
  revalidatePath("/", "layout");
}

export async function scheduleAllReady(accountId?: number) {
  await requireAuth();
  for (const c of await q.content({ accountId, status: "ready", limit: 500 })) await scheduleOne(c.id);
  revalidatePath("/", "layout");
  redirect("/schedule");
}

/** Instagram (automatic) posts go out on the next cron tick, within 5 minutes. */
export async function postNow(postId: number) {
  await requireAuth();
  const p = await q.post(postId);
  if (!p || p.status === "posted" || p.status === "publishing") return;
  await sql.run("UPDATE posts SET scheduled_at = ?, status = 'scheduled', container_id = NULL, error = NULL WHERE id = ?", new Date().toISOString(), postId);
  revalidatePath("/", "layout");
}

export async function markPosted(postId: number, fd?: FormData) {
  await requireAuth();
  const link = fd ? s(fd, "link") : "";
  const p = await q.post(postId);
  if (!p) return;
  await sql.run("UPDATE posts SET status = 'posted', posted_at = ?, permalink = COALESCE(NULLIF(?, ''), permalink) WHERE id = ?", new Date().toISOString(), link, postId);
  await markContentPostedIfDone(p.content_id);
  revalidatePath("/", "layout");
}

export async function cancelPost(postId: number) {
  await requireAuth();
  const p = await q.post(postId);
  if (!p || p.status === "posted") return;
  await sql.run("UPDATE posts SET status = 'cancelled' WHERE id = ?", postId);
  const active = await sql.get<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE content_id = ? AND status NOT IN ('cancelled')", p.content_id);
  if ((active?.n ?? 0) === 0) await sql.run("UPDATE content SET status = 'ready', updated_at = datetime('now') WHERE id = ?", p.content_id);
  else await markContentPostedIfDone(p.content_id);
  revalidatePath("/", "layout");
}
