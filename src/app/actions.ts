"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, q } from "@/lib/db";
import { cancel, enqueue, enqueueCycle, enqueuePlanWeek, enqueueProduce, enqueuePublish, markContentPostedIfDone } from "@/lib/agents/runner";
import { nextSlot } from "@/lib/publish/schedule";
import { MODELS } from "@/lib/options";
import type { JobKind } from "@/lib/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const clampInt = (v: string, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const many = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);

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
    approval_mode: "manual", // auto-posting arrives with the Publisher in Phase 3
    brand_colors: JSON.stringify(colors),
    avoid: s(fd, "avoid"),
    inspiration: s(fd, "inspiration"),
  };
}

export async function createAccount(fd: FormData) {
  const f = accountFields(fd);
  const keys = Object.keys(f);
  const r = db
    .prepare(`INSERT INTO accounts (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .run(...Object.values(f));
  const id = Number(r.lastInsertRowid);
  if (fd.get("start_strategy") === "on") enqueue("strategy", id);
  revalidatePath("/", "layout");
  redirect(`/accounts/${id}`);
}

export async function updateAccount(id: number, fd: FormData) {
  const f = accountFields(fd);
  db.prepare(`UPDATE accounts SET ${Object.keys(f).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
    ...Object.values(f),
    id,
  );
  revalidatePath("/", "layout");
  redirect(`/accounts/${id}`);
}

export async function deleteAccount(id: number) {
  db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  revalidatePath("/", "layout");
  redirect("/accounts");
}

export async function runJob(kind: JobKind, accountId: number) {
  const id = enqueue(kind, accountId);
  revalidatePath("/", "layout");
  redirect(`/agents/jobs/${id}`);
}

export async function runPlanWeek(accountId: number) {
  enqueuePlanWeek(accountId);
  revalidatePath("/", "layout");
  redirect(`/agents`);
}

export async function runCycle(accountId: number) {
  enqueueCycle(accountId);
  revalidatePath("/", "layout");
  redirect(`/agents`);
}

export async function contentFromTrend(trendId: number) {
  const t = q.trend(trendId);
  if (!t) return;
  const id = enqueue("from-trend", t.account_id, { refId: trendId });
  revalidatePath("/", "layout");
  redirect(`/agents/jobs/${id}`);
}

export async function setTrendStatus(trendId: number, status: "new" | "dismissed") {
  db.prepare("UPDATE trends SET status = ? WHERE id = ?").run(status, trendId);
  revalidatePath("/trends");
}

export async function setContentStatus(id: number, status: string, fd?: FormData) {
  const feedback = fd ? s(fd, "feedback") : null;
  if (feedback !== null) {
    db.prepare("UPDATE content SET status = ?, feedback = ?, updated_at = datetime('now') WHERE id = ?").run(status, feedback, id);
  } else {
    db.prepare("UPDATE content SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }
  revalidatePath("/", "layout");
}

export async function updateContentText(id: number, fd: FormData) {
  const hashtags = s(fd, "hashtags")
    .split(/[\s,]+/)
    .map((h) => h.replace(/^#/, ""))
    .filter(Boolean);
  db.prepare("UPDATE content SET hook = ?, caption = ?, hashtags = ?, cta = ?, updated_at = datetime('now') WHERE id = ?").run(
    s(fd, "hook"),
    s(fd, "caption"),
    JSON.stringify(hashtags),
    s(fd, "cta"),
    id,
  );
  revalidatePath(`/pipeline/${id}`);
}

export async function deleteContent(id: number) {
  db.prepare("DELETE FROM content WHERE id = ?").run(id);
  revalidatePath("/", "layout");
  redirect("/pipeline");
}

export async function cancelJob(id: number) {
  cancel(id);
  revalidatePath("/", "layout");
}

/** settingKey is `model:<agent>` or `model:<agent>:scripts`. */
export async function setAgentModel(settingKey: string, fd: FormData) {
  const model = s(fd, "model");
  if (/^model:[a-z-]+(:scripts)?$/.test(settingKey) && MODELS.some((m) => m.id === model)) q.setSetting(settingKey, model);
  revalidatePath("/agents");
}

// ---------- Phase 2: production ----------

export async function produce(contentId: number) {
  const c = q.contentItem(contentId);
  if (!c || !["approved", "review", "ready"].includes(c.status)) return;
  enqueueProduce(contentId);
  revalidatePath("/", "layout");
}

/** Throw away the scene plan and render, and produce from scratch (new images, new plan). */
export async function redoProduction(contentId: number, fd?: FormData) {
  const note = fd ? s(fd, "feedback") : "";
  db.prepare("UPDATE content SET production = NULL, media = NULL, status = 'approved', feedback = CASE WHEN ? != '' THEN ? ELSE feedback END, updated_at = datetime('now') WHERE id = ?").run(
    note,
    note,
    contentId,
  );
  enqueueProduce(contentId);
  revalidatePath("/", "layout");
}

export async function produceAllApproved(accountId?: number) {
  const items = q.content({ accountId, status: "approved", limit: 200 });
  for (const it of items) enqueueProduce(it.id);
  revalidatePath("/", "layout");
  redirect("/agents");
}

// ---------- Phase 3: publishing ----------

export async function connectInstagram(accountId: number, fd: FormData) {
  const token = s(fd, "token");
  if (!token) return;
  const { whoAmI } = await import("@/lib/publish/instagram");
  let me: { userId: string; username: string; accountType: string };
  try {
    me = await whoAmI(token);
  } catch (e) {
    q.setSetting(`connect-error:${accountId}`, (e as Error).message);
    revalidatePath(`/accounts/${accountId}`);
    return;
  }
  q.setSetting(`connect-error:${accountId}`, "");
  db.prepare(
    `INSERT INTO connections (account_id, platform, remote_user_id, username, token, expires_at, refreshed_at)
     VALUES (?, 'instagram', ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, platform) DO UPDATE SET remote_user_id = excluded.remote_user_id, username = excluded.username,
       token = excluded.token, expires_at = excluded.expires_at, refreshed_at = excluded.refreshed_at`,
  ).run(accountId, me.userId, me.username, token, new Date(Date.now() + 60 * 86400_000).toISOString(), new Date().toISOString());
  revalidatePath(`/accounts/${accountId}`);
}

export async function disconnect(accountId: number, platform: string) {
  db.prepare("DELETE FROM connections WHERE account_id = ? AND platform = ?").run(accountId, platform);
  revalidatePath(`/accounts/${accountId}`);
}

function scheduleOne(contentId: number) {
  const c = q.contentItem(contentId);
  if (!c || c.status !== "ready" || !c.media) return 0;
  const a = q.account(c.account_id);
  if (!a) return 0;
  const want = (c.platform === "both" ? ["instagram", "tiktok"] : [c.platform]).filter((p) => a.platforms.includes(p));
  const igApi = !!q.connection(a.id, "instagram");
  const at = nextSlot(a, c);
  let n = 0;
  for (const platform of want) {
    const method = platform === "instagram" && igApi ? "api" : "phone";
    const r = db
      .prepare("INSERT INTO posts (content_id, account_id, platform, method, status, scheduled_at) VALUES (?, ?, ?, ?, 'scheduled', ?)")
      .run(c.id, a.id, platform, method, at);
    if (method === "api") enqueuePublish(Number(r.lastInsertRowid), a.id, at);
    n++;
  }
  if (n) db.prepare("UPDATE content SET status = 'scheduled', updated_at = datetime('now') WHERE id = ?").run(c.id);
  return n;
}

export async function scheduleContent(contentId: number) {
  scheduleOne(contentId);
  revalidatePath("/", "layout");
}

export async function scheduleAllReady(accountId?: number) {
  for (const c of q.content({ accountId, status: "ready", limit: 500 })) scheduleOne(c.id);
  revalidatePath("/", "layout");
  redirect("/schedule");
}

export async function postNow(postId: number) {
  const p = q.post(postId);
  if (!p || p.status === "posted" || p.status === "publishing") return;
  const now = new Date().toISOString();
  db.prepare("UPDATE posts SET scheduled_at = ?, status = 'scheduled', error = NULL WHERE id = ?").run(now, postId);
  if (p.method === "api") {
    db.prepare("UPDATE jobs SET status = 'cancelled', finished_at = datetime('now') WHERE kind = 'publish' AND ref_id = ? AND status = 'queued'").run(postId);
    enqueuePublish(postId, p.account_id, now);
  }
  revalidatePath("/", "layout");
}

export async function markPosted(postId: number, fd?: FormData) {
  const link = fd ? s(fd, "link") : "";
  const p = q.post(postId);
  if (!p) return;
  db.prepare("UPDATE posts SET status = 'posted', posted_at = ?, permalink = COALESCE(NULLIF(?, ''), permalink) WHERE id = ?").run(new Date().toISOString(), link, postId);
  markContentPostedIfDone(p.content_id);
  revalidatePath("/", "layout");
}

export async function cancelPost(postId: number) {
  const p = q.post(postId);
  if (!p || p.status === "posted") return;
  db.prepare("UPDATE posts SET status = 'cancelled' WHERE id = ?").run(postId);
  db.prepare("UPDATE jobs SET status = 'cancelled', finished_at = datetime('now') WHERE kind = 'publish' AND ref_id = ? AND status = 'queued'").run(postId);
  const active = db.prepare("SELECT COUNT(*) n FROM posts WHERE content_id = ? AND status NOT IN ('cancelled')").get(p.content_id) as { n: number };
  if (active.n === 0) db.prepare("UPDATE content SET status = 'ready', updated_at = datetime('now') WHERE id = ?").run(p.content_id);
  else markContentPostedIfDone(p.content_id);
  revalidatePath("/", "layout");
}
