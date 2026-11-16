import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, db, LOG_DIR, q } from "../db";
import type { Job, JobKind } from "../types";
import { claudeBin } from "../claude-cli";
import { applyResult } from "./apply";
import { buildPrompt } from "./prompts";
import { agentById, JOB_KINDS } from "./registry";
import { planSchema, scenePlanSchema, strategySchema, trendsSchema } from "./schemas";
import { nextDays } from "../dates";

// The job queue. One agent runs at a time: it protects your subscription usage limits
// and keeps your PC responsive. Each job is one headless `claude -p` run.

const MAX_CONCURRENT = 1;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;

const SCHEMAS: Record<JobKind, object> = {
  strategy: strategySchema,
  trends: trendsSchema,
  plan: planSchema,
  "from-trend": planSchema,
  video: scenePlanSchema,
  design: scenePlanSchema,
  render: {},
};

type State = { running: Map<number, ChildProcess>; booted: boolean };
const g = globalThis as unknown as { __hqRunner?: State };
const state: State = (g.__hqRunner ??= { running: new Map(), booted: false });

// Next's dev server can load this module more than once (separate module contexts for routes,
// pages and actions), so nothing here may assume it is the only copy. Ownership lives in the DB:
// a running job records the server process that owns it, and only counts as interrupted when
// that process is really gone.

function alive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Running jobs whose owning server process died (a real restart or crash) are marked failed. */
function reapOrphans() {
  const running = db.prepare("SELECT id, runner_pid, child_pid FROM jobs WHERE status = 'running'").all() as {
    id: number;
    runner_pid: number | null;
    child_pid: number | null;
  }[];
  for (const j of running) {
    if (alive(j.runner_pid)) continue;
    if (alive(j.child_pid)) {
      try {
        process.kill(j.child_pid!);
      } catch {}
    }
    db.prepare(
      "UPDATE jobs SET status = 'failed', error = 'Interrupted: the dashboard server stopped while this job was running', finished_at = datetime('now') WHERE id = ? AND status = 'running'",
    ).run(j.id);
    log(j.id, "✗ Interrupted: the dashboard server stopped while this job was running");
  }
}

if (!state.booted) {
  state.booted = true;
  setTimeout(kick, 500);
  // Paused jobs (e.g. waiting for the free image quota to reset) start on their own.
  setInterval(kick, 60_000);
}

export const logPath = (jobId: number) => path.join(LOG_DIR, `job-${jobId}.log`);
const log = (jobId: number, line: string) => fs.appendFileSync(logPath(jobId), line + "\n");

/** Script-writing jobs run many times a day, so they get their own (lighter) model setting. */
export const isScriptJob = (kind: JobKind) => kind === "plan" || kind === "from-trend";

export function modelFor(agentId: string, kind?: JobKind): string {
  if (kind && isScriptJob(kind)) return q.setting(`model:${agentId}:scripts`, "sonnet");
  return q.setting(`model:${agentId}`, agentById(agentId)?.defaultModel ?? "sonnet");
}

export function enqueue(
  kind: JobKind,
  accountId: number,
  opts: { refId?: number; dependsOn?: number; targetDate?: string; notBefore?: string } = {},
): number {
  const agent = JOB_KINDS[kind].agent;
  const r = db
    .prepare(
      "INSERT INTO jobs (kind, agent, account_id, ref_id, depends_on, target_date, not_before, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')",
    )
    .run(kind, agent, accountId, opts.refId ?? null, opts.dependsOn ?? null, opts.targetDate ?? null, opts.notBefore ?? null);
  const id = Number(r.lastInsertRowid);
  log(
    id,
    `◦ Queued: ${JOB_KINDS[kind].label}${opts.targetDate ? ` for ${opts.targetDate}` : ""}${opts.dependsOn ? ` (waits for job #${opts.dependsOn})` : ""}`,
  );
  setTimeout(kick, 0);
  return id;
}

/**
 * One day-plan job per day for the next 7 days, skipping days that already have their full
 * daily mix (or a plan job waiting). Jobs run one after another, so each day sees the days
 * planned before it and doesn't repeat them.
 */
export function enqueuePlanWeek(accountId: number, dependsOn?: number): number[] {
  const a = q.account(accountId);
  if (!a) throw new Error("Account not found");
  const quota = a.reels_per_day + a.posts_per_day;
  const ids: number[] = [];
  for (const date of nextDays(7)) {
    const have = (
      db
        .prepare("SELECT COUNT(*) n FROM content WHERE account_id = ? AND planned_date = ? AND status != 'rejected'")
        .get(accountId, date) as { n: number }
    ).n;
    const pending = (
      db
        .prepare("SELECT COUNT(*) n FROM jobs WHERE account_id = ? AND kind = 'plan' AND target_date = ? AND status IN ('queued','running')")
        .get(accountId, date) as { n: number }
    ).n;
    if (have >= quota || pending > 0) continue;
    ids.push(enqueue("plan", accountId, { targetDate: date, dependsOn }));
  }
  return ids;
}

/** Produce one approved piece: the right agent plans it, then the renderer paints, voices and renders it. */
export function enqueueProduce(contentId: number): number[] {
  const c = q.contentItem(contentId);
  if (!c) throw new Error("Content not found");
  const busy = db
    .prepare("SELECT COUNT(*) n FROM jobs WHERE ref_id = ? AND kind IN ('video','design','render') AND status IN ('queued','running')")
    .get(contentId) as { n: number };
  if (busy.n) return [];
  db.prepare("UPDATE content SET status = 'producing', updated_at = datetime('now') WHERE id = ?").run(contentId);
  // Re-render with the existing plan if there is one (e.g. after a template change); otherwise plan first.
  if (c.production) return [enqueue("render", c.account_id, { refId: contentId })];
  const plan = enqueue(c.format === "reel" ? "video" : "design", c.account_id, { refId: contentId });
  return [plan, enqueue("render", c.account_id, { refId: contentId, dependsOn: plan })];
}

/** Manager (basic): strategy if missing → trends → the next 7 days, as a chain of dependent jobs. */
export function enqueueCycle(accountId: number): number[] {
  const a = q.account(accountId);
  if (!a) throw new Error("Account not found");
  const ids: number[] = [];
  let prev: number | undefined;
  if (!a.strategy) prev = enqueue("strategy", accountId);
  if (prev) ids.push(prev);
  prev = enqueue("trends", accountId, { dependsOn: prev });
  ids.push(prev);
  ids.push(...enqueuePlanWeek(accountId, prev));
  return ids;
}

export function cancel(jobId: number) {
  const job = db.prepare("SELECT status, child_pid FROM jobs WHERE id = ?").get(jobId) as
    | { status: string; child_pid: number | null }
    | undefined;
  if (job?.status === "running" || job?.status === "queued") log(jobId, "✗ Cancelled by you");
  const child = state.running.get(jobId);
  if (child) child.kill();
  else if (job?.status === "running" && alive(job.child_pid)) {
    try {
      process.kill(job.child_pid!); // owned by another module copy: kill the agent process directly
    } catch {}
  }
  db.prepare(
    "UPDATE jobs SET status = 'cancelled', finished_at = datetime('now') WHERE id = ? AND status IN ('queued','running')",
  ).run(jobId);
  setTimeout(kick, 0);
}

export function kick() {
  reapOrphans();
  // Count running jobs across every copy of this module, not just this one.
  const runningNow = (db.prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'running'").get() as { n: number }).n;
  if (runningNow >= MAX_CONCURRENT) return;
  const queued = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY id").all() as unknown as Job[];
  const now = new Date().toISOString();
  for (const job of queued) {
    const nb = (job as Job & { not_before?: string | null }).not_before;
    if (nb && nb > now) continue;
    if (job.depends_on) {
      const dep = q.job(job.depends_on);
      if (!dep || dep.status === "failed" || dep.status === "cancelled") {
        db.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(
          `Skipped: job #${job.depends_on} did not finish`,
          job.id,
        );
        log(job.id, `✗ Skipped because job #${job.depends_on} did not finish`);
        continue;
      }
      if (dep.status !== "done") continue;
    }
    start(job);
    return;
  }
}

function describeTool(name: string, input: Record<string, unknown>): string {
  if (name === "WebSearch") return `⌕ Searching: ${input.query}`;
  if (name === "WebFetch") return `↗ Reading: ${input.url}`;
  if (name === "StructuredOutput") return "⇢ Writing the final result";
  return `⚙ ${name}`;
}

function start(job: Job) {
  if (job.kind === "render") return startRender(job);
  const agent = agentById(job.agent)!;
  const model = modelFor(agent.id, job.kind);
  let prompt: string;
  try {
    prompt = buildPrompt(job);
  } catch (e) {
    db.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(
      (e as Error).message,
      job.id,
    );
    setTimeout(kick, 0);
    return;
  }

  // Atomic claim: only one copy of the queue can move this job to running, and only while
  // the global concurrency limit has room. Losing the race simply means someone else runs it.
  const claimed = db
    .prepare(
      `UPDATE jobs SET status = 'running', model = ?, runner_pid = ?, error = NULL, started_at = datetime('now')
       WHERE id = ? AND status = 'queued' AND (SELECT COUNT(*) FROM jobs WHERE status = 'running') < ?`,
    )
    .run(model, process.pid, job.id, MAX_CONCURRENT);
  if (Number(claimed.changes) !== 1) return;
  log(job.id, `▸ ${agent.name} started · model ${model}`);

  const args = [
    "-p",
    "--agent", agent.id,
    "--model", model,
    "--output-format", "stream-json",
    "--verbose",
    "--json-schema", JSON.stringify(SCHEMAS[job.kind]),
    "--strict-mcp-config", // don't load your other MCP servers into agent runs
    "--no-session-persistence",
    "--disallowedTools", "Bash", "Edit", "Write", "NotebookEdit",
    // StructuredOutput is the tool Claude Code uses to return the --json-schema result; the agent
    // file's `tools:` list must include it too, or the run silently returns plain text.
    "--allowedTools", ...agent.tools, "StructuredOutput",
  ];

  const child = spawn(claudeBin(), args, {
    cwd: process.cwd(), // project root, so .claude/agents/*.md is found
    env: process.env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  state.running.set(job.id, child);
  if (child.pid) db.prepare("UPDATE jobs SET child_pid = ? WHERE id = ?").run(child.pid, job.id);

  const startedAt = Date.now();
  const raw = fs.createWriteStream(path.join(LOG_DIR, `job-${job.id}.jsonl`));
  let buffer = "";
  let result: Record<string, unknown> | null = null;
  let stderr = "";

  const timer = setTimeout(() => {
    log(job.id, `✗ Timed out after ${JOB_TIMEOUT_MS / 60000} minutes`);
    child.kill();
  }, JOB_TIMEOUT_MS);

  child.stdout.on("data", (chunk: Buffer) => {
    raw.write(chunk);
    buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "assistant") {
        const content = ((ev.message as { content?: unknown[] })?.content ?? []) as Record<string, unknown>[];
        for (const c of content) {
          if (c.type === "text" && String(c.text).trim()) log(job.id, `› ${String(c.text).trim().slice(0, 600)}`);
          if (c.type === "tool_use") log(job.id, describeTool(String(c.name), (c.input ?? {}) as Record<string, unknown>));
        }
      } else if (ev.type === "result") {
        result = ev;
      }
    }
  });
  child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));

  child.on("error", (err) => {
    log(job.id, `✗ Could not start Claude Code: ${err.message}`);
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    raw.end();
    state.running.delete(job.id);
    const duration = Date.now() - startedAt;
    const current = q.job(job.id);
    if (current?.status === "cancelled") {
      setTimeout(kick, 0);
      return;
    }

    const fail = (msg: string) => {
      log(job.id, `✗ ${msg}`);
      if ((job.kind === "video" || job.kind === "design") && job.ref_id) contentBack(job.ref_id);
      db.prepare(
        "UPDATE jobs SET status = 'failed', error = ?, duration_ms = ?, cost_usd = ?, finished_at = datetime('now') WHERE id = ?",
      ).run(msg, duration, (result?.total_cost_usd as number) ?? null, job.id);
    };

    try {
      if (!result) {
        fail(stderr.trim().split("\n").slice(-3).join(" ") || `Claude Code exited with code ${code} and no result`);
      } else if (result.is_error) {
        fail(String(result.result || result.subtype || "Agent reported an error"));
      } else {
        const data = result.structured_output ?? extractJson(String(result.result ?? ""));
        if (!data) throw new Error("The agent finished but returned no structured output");
        const summary = applyResult(current ?? job, data);
        db.prepare(
          "UPDATE jobs SET status = 'done', error = NULL, summary = ?, duration_ms = ?, cost_usd = ?, finished_at = datetime('now') WHERE id = ?",
        ).run(summary, duration, (result.total_cost_usd as number) ?? null, job.id);
        log(job.id, `✓ Done in ${Math.round(duration / 1000)}s — ${summary}`);
      }
    } catch (e) {
      fail((e as Error).message);
    }
    setTimeout(kick, 0);
  });

  child.stdin.write(prompt);
  child.stdin.end();
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return candidate ? JSON.parse(candidate) : null;
  } catch {
    return null;
  }
}

export function readLog(jobId: number, maxLines = 400): string[] {
  try {
    const lines = fs.readFileSync(logPath(jobId), "utf8").split("\n").filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}


// ---------------------------------------------------------------------------
// Render jobs: no agent, just the studio pipeline (paint → voice → Remotion).

const STUDIO = path.join(process.cwd(), "studio");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

function contentBack(contentId: number) {
  db.prepare("UPDATE content SET status = 'approved', updated_at = datetime('now') WHERE id = ? AND status = 'producing'").run(contentId);
}

function paletteFor(colors: string[]) {
  const [field, deep, soft, ink] = colors;
  return { field: field || "#1330E0", deep: deep || "#0B1FA8", soft: soft || "#93A6FF", ink: ink || "#FFFFFF" };
}

function startRender(job: Job) {
  const claimed = db
    .prepare(
      `UPDATE jobs SET status = 'running', model = 'local', runner_pid = ?, error = NULL, started_at = datetime('now')
       WHERE id = ? AND status = 'queued' AND (SELECT COUNT(*) FROM jobs WHERE status = 'running') < ?`,
    )
    .run(process.pid, job.id, MAX_CONCURRENT);
  if (Number(claimed.changes) !== 1) return;

  const c = job.ref_id ? q.contentItem(job.ref_id) : null;
  const a = c ? q.account(c.account_id) : null;
  const finish = (status: "done" | "failed", summary: string | null, error: string | null, started: number) => {
    db.prepare("UPDATE jobs SET status = ?, summary = ?, error = ?, duration_ms = ?, finished_at = datetime('now') WHERE id = ?").run(
      status,
      summary,
      error,
      Date.now() - started,
      job.id,
    );
    setTimeout(kick, 0);
  };
  const started = Date.now();
  if (!c || !a || !c.production) {
    log(job.id, "✗ Nothing to render: the piece has no scene plan");
    if (c) contentBack(c.id);
    return finish("failed", null, "Nothing to render: the piece has no scene plan", started);
  }

  // One folder per scene plan + style: a retry or re-render reuses images that are already painted.
  const planHash = crypto.createHash("sha1").update(JSON.stringify(c.production) + (c.art_style || "")).digest("hex").slice(0, 10);
  const rel = `content-${c.id}/${planHash}`;
  const charHash = a.character ? crypto.createHash("sha1").update(a.character).digest("hex").slice(0, 8) : "";
  const outDir = path.join(MEDIA_DIR, rel);
  fs.mkdirSync(outDir, { recursive: true });
  const spec = {
    kind: c.format === "reel" ? "reel" : "slides",
    outDir,
    bundleCacheDir: path.join(DATA_DIR, "bundles"),
    palette: paletteFor(a.brand_colors),
    handle: a.ig_handle || a.tiktok_handle || a.name.replace(/\s+/g, "").toLowerCase(),
    voice: q.setting("voice", "af_heart"),
    speed: Number(q.setting("voice_speed", "1.0")),
    showCaptions: true,
    artStyle: c.art_style || a.art_styles[0] || "ghibli",
    character: a.character || null,
    characterRef: a.character ? path.join(MEDIA_DIR, `account-${a.id}`, `character-${charHash}.jpg`) : null,
    seed: c.id * 7919,
    scenes: c.production.scenes,
  };
  const specPath = path.join(outDir, "spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  log(job.id, `▸ Renderer started · ${spec.kind} · ${spec.scenes.length} ${spec.kind === "reel" ? "scenes" : "slides"} · style ${spec.artStyle}`);

  const child = spawn(process.execPath, ["scripts/render.mjs", specPath], { cwd: STUDIO, env: process.env, windowsHide: true });
  state.running.set(job.id, child);
  if (child.pid) db.prepare("UPDATE jobs SET child_pid = ? WHERE id = ?").run(child.pid, job.id);

  let buf = "";
  let result: Record<string, unknown> | null = null;
  let errTail = "";
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("PROGRESS ")) log(job.id, `› ${line.slice(9)}`);
      else if (line.startsWith("RESULT ")) {
        try {
          result = JSON.parse(line.slice(7));
        } catch {}
      }
    }
  });
  child.stderr.on("data", (d: Buffer) => (errTail = (errTail + d.toString("utf8")).slice(-2000)));
  const timer = setTimeout(() => child.kill(), 45 * 60 * 1000);

  child.on("close", () => {
    clearTimeout(timer);
    state.running.delete(job.id);
    if (q.job(job.id)?.status === "cancelled") {
      contentBack(c.id);
      return setTimeout(kick, 0);
    }
    if (result && !result.error) {
      const media = { ...result, dir: rel };
      db.prepare("UPDATE content SET media = ?, status = 'review', updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(media), c.id);
      const what = result.kind === "reel" ? `${Number(result.durationSeconds).toFixed(0)}s video` : `${(result.files as string[]).length} slide(s)`;
      const summary = `Rendered ${what} — waiting for your final review`;
      log(job.id, `✓ ${summary}`);
      return finish("done", summary, null, started);
    }
    if (result?.quota) {
      // Free image quota used up: park this render until the reset instead of failing the piece.
      const retryAt = String(result.retryAt);
      const when = new Date(retryAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const next = enqueue("render", c.account_id, { refId: c.id, notBefore: retryAt });
      const note = `Paused: the free image quota for today is used up. Retrying automatically at ${when} as run #${next}.`;
      log(job.id, `⏸ ${note}`);
      return finish("failed", null, note, started);
    }
    const msg = String(result?.error ?? errTail.trim().split("\n").filter((l) => !/Version mismatch|zod|remotion\.dev|-{5}|To resolve|breakages|^\s*-|^\s*$/.test(l)).slice(-3).join(" ") ?? "Render failed");
    log(job.id, `✗ ${msg}`);
    contentBack(c.id);
    finish("failed", null, msg || "Render failed", started);
  });
}
