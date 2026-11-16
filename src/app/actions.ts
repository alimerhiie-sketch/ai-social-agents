"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, q } from "@/lib/db";
import { cancel, enqueue, enqueueCycle } from "@/lib/agents/runner";
import { MODELS } from "@/lib/options";
import type { JobKind } from "@/lib/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
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
    posts_per_week: Math.max(1, Math.min(21, Number(s(fd, "posts_per_week")) || 5)),
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

export async function setAgentModel(agentId: string, fd: FormData) {
  const model = s(fd, "model");
  if (MODELS.some((m) => m.id === model)) q.setSetting(`model:${agentId}`, model);
  revalidatePath("/agents");
}
