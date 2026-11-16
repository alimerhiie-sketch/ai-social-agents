import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db, LOG_DIR, q } from "../db";
import type { Job, JobKind } from "../types";
import { claudeBin } from "../claude-cli";
import { applyResult } from "./apply";
import { buildPrompt } from "./prompts";
import { agentById, JOB_KINDS } from "./registry";
import { planSchema, strategySchema, trendsSchema } from "./schemas";

// The job queue. One agent runs at a time: it protects your subscription usage limits
// and keeps your PC responsive. Each job is one headless `claude -p` run.

const MAX_CONCURRENT = 1;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;

const SCHEMAS: Record<JobKind, object> = {
  strategy: strategySchema,
  trends: trendsSchema,
  plan: planSchema,
  "from-trend": planSchema,
};

type State = { running: Map<number, ChildProcess>; booted: boolean };
const g = globalThis as unknown as { __hqRunner?: State };
const state: State = (g.__hqRunner ??= { running: new Map(), booted: false });

if (!state.booted) {
  state.booted = true;
  // A fresh server process means any job still marked "running" lost its process.
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = 'Interrupted: the dashboard server restarted while this job was running', finished_at = datetime('now') WHERE status = 'running'",
  ).run();
  setTimeout(kick, 500);
}

export const logPath = (jobId: number) => path.join(LOG_DIR, `job-${jobId}.log`);
const log = (jobId: number, line: string) => fs.appendFileSync(logPath(jobId), line + "\n");

export function modelFor(agentId: string): string {
  return q.setting(`model:${agentId}`, agentById(agentId)?.defaultModel ?? "sonnet");
}

export function enqueue(kind: JobKind, accountId: number, opts: { refId?: number; dependsOn?: number } = {}): number {
  const agent = JOB_KINDS[kind].agent;
  const r = db
    .prepare("INSERT INTO jobs (kind, agent, account_id, ref_id, depends_on, status) VALUES (?, ?, ?, ?, ?, 'queued')")
    .run(kind, agent, accountId, opts.refId ?? null, opts.dependsOn ?? null);
  const id = Number(r.lastInsertRowid);
  log(id, `◦ Queued: ${JOB_KINDS[kind].label}${opts.dependsOn ? ` (waits for job #${opts.dependsOn})` : ""}`);
  setTimeout(kick, 0);
  return id;
}

/** Manager (basic): strategy if missing → trends → weekly plan, as a chain of dependent jobs. */
export function enqueueCycle(accountId: number): number[] {
  const a = q.account(accountId);
  if (!a) throw new Error("Account not found");
  const ids: number[] = [];
  let prev: number | undefined;
  if (!a.strategy) prev = enqueue("strategy", accountId);
  if (prev) ids.push(prev);
  prev = enqueue("trends", accountId, { dependsOn: prev });
  ids.push(prev);
  ids.push(enqueue("plan", accountId, { dependsOn: prev }));
  return ids;
}

export function cancel(jobId: number) {
  const child = state.running.get(jobId);
  if (child) {
    log(jobId, "✗ Cancelled by you");
    child.kill();
  }
  db.prepare(
    "UPDATE jobs SET status = 'cancelled', finished_at = datetime('now') WHERE id = ? AND status IN ('queued','running')",
  ).run(jobId);
  setTimeout(kick, 0);
}

export function kick() {
  if (state.running.size >= MAX_CONCURRENT) return;
  const queued = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY id").all() as unknown as Job[];
  for (const job of queued) {
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
  const agent = agentById(job.agent)!;
  const model = modelFor(agent.id);
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

  db.prepare("UPDATE jobs SET status = 'running', model = ?, started_at = datetime('now') WHERE id = ?").run(model, job.id);
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
          "UPDATE jobs SET status = 'done', summary = ?, duration_ms = ?, cost_usd = ?, finished_at = datetime('now') WHERE id = ?",
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
