import { q, sql } from "./db";
import { nextDays } from "./dates";
import { agentById, JOB_KINDS } from "./agents/registry";
import type { JobKind } from "./types";

// The job queue lives in D1. The dashboard and the cron only *queue* work; the GitHub Actions
// runner (cloud/runner.ts) claims jobs one at a time and does them (Claude agents, painting, rendering).

export type HqEnv = {
  DB: unknown;
  MEDIA: KVNamespace;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_REF?: string;
  HQ_SECRET?: string;
  DASHBOARD_PASSWORD?: string;
  COMPOSIO_API_KEY?: string;
};

let pinnedEnv: HqEnv | null = null;
export function pinEnv(env: HqEnv) {
  pinnedEnv = env;
}
export async function env(): Promise<HqEnv> {
  if (pinnedEnv) return pinnedEnv;
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  return (await getCloudflareContext({ async: true })).env as unknown as HqEnv;
}

export async function log(jobId: number, line: string) {
  await sql.run("INSERT INTO job_logs (job_id, line) VALUES (?, ?)", jobId, line.slice(0, 2000));
}

export async function readLog(jobId: number, max = 400): Promise<string[]> {
  const rows = await sql.all<{ line: string }>("SELECT line FROM (SELECT id, line FROM job_logs WHERE job_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id", jobId, max);
  return rows.map((r) => r.line);
}

/** Script-writing jobs run many times a day, so they get their own (lighter) model setting. */
export const isScriptJob = (kind: JobKind) => kind === "plan" || kind === "from-trend";

export async function modelFor(agentId: string, kind?: JobKind): Promise<string> {
  if (kind && isScriptJob(kind)) return q.setting(`model:${agentId}:scripts`, "sonnet");
  return q.setting(`model:${agentId}`, agentById(agentId)?.defaultModel ?? "sonnet");
}

export async function enqueue(
  kind: JobKind,
  accountId: number,
  opts: { refId?: number; dependsOn?: number; targetDate?: string; notBefore?: string } = {},
): Promise<number> {
  const r = await sql.run(
    "INSERT INTO jobs (kind, agent, account_id, ref_id, depends_on, target_date, not_before, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')",
    kind,
    JOB_KINDS[kind].agent,
    accountId,
    opts.refId,
    opts.dependsOn,
    opts.targetDate,
    opts.notBefore,
  );
  const id = r.lastRowId;
  await log(id, `◦ Queued: ${JOB_KINDS[kind].label}${opts.targetDate ? ` for ${opts.targetDate}` : ""}${opts.dependsOn ? ` (waits for job #${opts.dependsOn})` : ""}`);
  return id;
}

/** One scripting job per day for the next 7 days, skipping days that already have their full mix. */
export async function enqueuePlanWeek(accountId: number, dependsOn?: number): Promise<number[]> {
  const a = await q.account(accountId);
  if (!a) throw new Error("Account not found");
  const quota = a.reels_per_day + a.posts_per_day;
  const ids: number[] = [];
  for (const date of nextDays(7)) {
    const have = await sql.get<{ n: number }>(
      "SELECT COUNT(*) n FROM content WHERE account_id = ? AND planned_date = ? AND status != 'rejected'",
      accountId,
      date,
    );
    const pending = await sql.get<{ n: number }>(
      "SELECT COUNT(*) n FROM jobs WHERE account_id = ? AND kind = 'plan' AND target_date = ? AND status IN ('queued','running')",
      accountId,
      date,
    );
    if ((have?.n ?? 0) >= quota || (pending?.n ?? 0) > 0) continue;
    ids.push(await enqueue("plan", accountId, { targetDate: date, dependsOn }));
  }
  return ids;
}

/** Produce one approved piece: the right agent plans it, then the runner paints, voices and renders it. */
export async function enqueueProduce(contentId: number): Promise<number[]> {
  const c = await q.contentItem(contentId);
  if (!c) throw new Error("Content not found");
  const busy = await sql.get<{ n: number }>(
    "SELECT COUNT(*) n FROM jobs WHERE ref_id = ? AND kind IN ('video','design','render') AND status IN ('queued','running')",
    contentId,
  );
  if (busy?.n) return [];
  await sql.run("UPDATE content SET status = 'producing', updated_at = datetime('now') WHERE id = ?", contentId);
  if (c.production) return [await enqueue("render", c.account_id, { refId: contentId })];
  const plan = await enqueue(c.format === "reel" ? "video" : "design", c.account_id, { refId: contentId });
  return [plan, await enqueue("render", c.account_id, { refId: contentId, dependsOn: plan })];
}

/** Manager: strategy if missing → trends → the next 7 days, as a chain of dependent jobs. */
export async function enqueueCycle(accountId: number): Promise<number[]> {
  const a = await q.account(accountId);
  if (!a) throw new Error("Account not found");
  const ids: number[] = [];
  let prev: number | undefined;
  if (!a.strategy) ids.push((prev = await enqueue("strategy", accountId)));
  ids.push((prev = await enqueue("trends", accountId, { dependsOn: prev })));
  ids.push(...(await enqueuePlanWeek(accountId, prev)));
  return ids;
}

export async function cancel(jobId: number) {
  const job = await q.job(jobId);
  if (job?.status === "running" || job?.status === "queued") await log(jobId, "✗ Cancelled by you");
  // A running job notices the cancel at its next heartbeat and stops.
  await sql.run("UPDATE jobs SET status = 'cancelled', finished_at = datetime('now') WHERE id = ? AND status IN ('queued','running')", jobId);
  if (job && (job.kind === "video" || job.kind === "design" || job.kind === "render") && job.ref_id)
    await sql.run("UPDATE content SET status = 'approved' WHERE id = ? AND status = 'producing'", job.ref_id);
}

/** A piece is "posted" once every platform it was scheduled for is posted. */
export async function markContentPostedIfDone(contentId: number) {
  const left = await sql.get<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE content_id = ? AND status NOT IN ('posted','cancelled')", contentId);
  const any = await sql.get<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE content_id = ? AND status = 'posted'", contentId);
  if ((left?.n ?? 0) === 0 && (any?.n ?? 0) > 0)
    await sql.run("UPDATE content SET status = 'posted', updated_at = datetime('now') WHERE id = ?", contentId);
}

// ---------------------------------------------------------------------------
// Waking the GitHub Actions runner

/** True if the runner has checked in during the last 3 minutes. */
export async function runnerAlive(): Promise<boolean> {
  const hb = await q.setting("runner:heartbeat", "");
  return !!hb && Date.now() - new Date(hb).getTime() < 3 * 60_000;
}

/** Jobs that could start right now (queued, due, dependency done or absent). */
export async function readyJobCount(): Promise<number> {
  const r = await sql.get<{ n: number }>(
    `SELECT COUNT(*) n FROM jobs j WHERE j.status = 'queued'
       AND (j.not_before IS NULL OR j.not_before <= ?)
       AND (j.depends_on IS NULL OR EXISTS (SELECT 1 FROM jobs d WHERE d.id = j.depends_on AND d.status = 'done'))`,
    new Date().toISOString(),
  );
  return r?.n ?? 0;
}

/** Start the GitHub Actions runner if there's work and it isn't already running. */
export async function wakeRunner(reason: string): Promise<string> {
  if (await runnerAlive()) return "runner already active";
  if ((await readyJobCount()) === 0) return "nothing ready";
  const last = await q.setting("runner:dispatched", "");
  if (last && Date.now() - new Date(last).getTime() < 4 * 60_000) return "runner starting";
  const e = await env();
  if (!e.GITHUB_TOKEN || !e.GITHUB_REPO) return "GitHub not configured";
  const res = await fetch(`https://api.github.com/repos/${e.GITHUB_REPO}/actions/workflows/runner.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "agent-hq",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: e.GITHUB_REF || "master", inputs: { reason: reason.slice(0, 80) } }),
  });
  if (!res.ok) return `dispatch failed: ${res.status} ${(await res.text()).slice(0, 200)}`;
  await q.setSetting("runner:dispatched", new Date().toISOString());
  return "runner started";
}
