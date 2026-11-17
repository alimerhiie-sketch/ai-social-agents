// Agent HQ cloud runner — runs inside GitHub Actions (see .github/workflows/runner.yml).
// Claims queued jobs from the Worker's database one at a time and does them:
//   strategy / trends / plan / from-trend / video / design → Claude Code headless (your subscription token)
//   render → paint (Cloudflare Workers AI) + voice (Kokoro) + Remotion, then upload the finished files
// Exits when the queue has been empty for a minute, or before Actions' 6-hour limit.
//
// Env: HQ_URL, HQ_SECRET (Worker internal API), CLAUDE_CODE_OAUTH_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { q, sql } from "../src/lib/db";
import { log, modelFor } from "../src/lib/queue";
import { applyResult } from "../src/lib/agents/apply";
import { buildPrompt } from "../src/lib/agents/prompts";
import { agentById, JOB_KINDS } from "../src/lib/agents/registry";
import { planSchema, scenePlanSchema, strategySchema, trendsSchema } from "../src/lib/agents/schemas";
import type { Job, JobKind } from "../src/lib/types";

const ROOT = process.cwd(); // the workflow runs from the repo root
const STUDIO = path.join(ROOT, "studio");
const RUN_ID = process.env.GITHUB_RUN_ID ? `gh-${process.env.GITHUB_RUN_ID}` : `local-${process.pid}`;
const STARTED = Date.now();
const MAX_RUNTIME_MS = 5.5 * 3600_000; // stay under Actions' 6 h job limit
const IDLE_EXIT_MS = 60_000;
const AGENT_TIMEOUT_MS = 20 * 60_000;
const RENDER_TIMEOUT_MS = 45 * 60_000;

const SCHEMAS: Partial<Record<JobKind, object>> = {
  strategy: strategySchema,
  trends: trendsSchema,
  plan: planSchema,
  "from-trend": planSchema,
  video: scenePlanSchema,
  design: scenePlanSchema,
};

const say = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Queue

async function heartbeat() {
  await q.setSetting("runner:heartbeat", new Date().toISOString());
}

/** Next job that can start now; fails jobs whose dependency failed. */
async function nextJob(): Promise<Job | null> {
  const now = new Date().toISOString();
  const queued = await sql.all<Job & { not_before: string | null }>("SELECT * FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 50");
  for (const job of queued) {
    if (job.not_before && job.not_before > now) continue;
    if (job.depends_on) {
      const dep = await q.job(job.depends_on);
      if (!dep || dep.status === "failed" || dep.status === "cancelled") {
        await sql.run("UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ? AND status = 'queued'", `Skipped: job #${job.depends_on} did not finish`, job.id);
        await log(job.id, `✗ Skipped because job #${job.depends_on} did not finish`);
        continue;
      }
      if (dep.status !== "done") continue;
    }
    const model = job.kind === "render" ? "local" : await modelFor(job.agent, job.kind);
    const claimed = await sql.run(
      "UPDATE jobs SET status = 'running', model = ?, runner_id = ?, heartbeat_at = datetime('now'), error = NULL, started_at = datetime('now') WHERE id = ? AND status = 'queued'",
      model,
      RUN_ID,
      job.id,
    );
    if (claimed.changes === 1) return { ...job, model, status: "running" };
  }
  return null;
}

async function finish(job: Job, status: "done" | "failed", summary: string | null, error: string | null, started: number, cost?: number) {
  await sql.run(
    "UPDATE jobs SET status = ?, summary = ?, error = ?, duration_ms = ?, cost_usd = ?, finished_at = datetime('now') WHERE id = ? AND status = 'running'",
    status,
    summary,
    error,
    Date.now() - started,
    cost ?? null,
    job.id,
  );
}

const contentBack = (id: number) => sql.run("UPDATE content SET status = 'approved', updated_at = datetime('now') WHERE id = ? AND status = 'producing'", id);

/** Runs a child process, killing it if the job is cancelled from the dashboard or times out. */
function supervise(job: Job, child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const watch = setInterval(async () => {
      try {
        await heartbeat();
        await sql.run("UPDATE jobs SET heartbeat_at = datetime('now') WHERE id = ?", job.id);
        if ((await q.job(job.id))?.status === "cancelled") child.kill();
      } catch {}
    }, 30_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(watch);
      resolve(code);
    });
    child.on("error", () => {});
  });
}

// ---------------------------------------------------------------------------
// Agent jobs (Claude Code headless on the subscription token)

function describeTool(name: string, input: Record<string, unknown>) {
  if (name === "WebSearch") return `⌕ Searching: ${input.query}`;
  if (name === "WebFetch") return `↗ Reading: ${input.url}`;
  if (name === "StructuredOutput") return "⇢ Writing the final result";
  return `⚙ ${name}`;
}

/** True when the run hit the subscription's usage limit (so we pause instead of failing). */
const usageLimited = (text: string) => /usage limit|rate limit|limit reached|try again (later|at)/i.test(text);

async function runAgent(job: Job) {
  const started = Date.now();
  const agent = agentById(job.agent)!;
  const prompt = await buildPrompt(job);
  await log(job.id, `▸ ${agent.name} started in the cloud · model ${job.model}`);
  const args = [
    "-p",
    "--agent", agent.id,
    "--model", String(job.model),
    "--output-format", "stream-json",
    "--verbose",
    "--json-schema", JSON.stringify(SCHEMAS[job.kind]),
    "--strict-mcp-config",
    "--no-session-persistence",
    "--disallowedTools", "Bash", "Edit", "Write", "NotebookEdit",
    "--allowedTools", ...agent.tools, "StructuredOutput",
  ];
  const child = spawn("claude", args, { cwd: ROOT, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  let result: Record<string, unknown> | null = null;
  let stderr = "";
  const pending: Promise<unknown>[] = [];
  child.stdout!.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "assistant") {
        for (const c of ((ev.message as { content?: Record<string, unknown>[] })?.content ?? [])) {
          if (c.type === "text" && String(c.text).trim()) pending.push(log(job.id, `› ${String(c.text).trim().slice(0, 600)}`));
          if (c.type === "tool_use") pending.push(log(job.id, describeTool(String(c.name), (c.input ?? {}) as Record<string, unknown>)));
        }
      } else if (ev.type === "result") result = ev;
    }
  });
  child.stderr!.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
  child.stdin!.write(prompt);
  child.stdin!.end();
  const code = await supervise(job, child, AGENT_TIMEOUT_MS);
  await Promise.allSettled(pending);
  if ((await q.job(job.id))?.status === "cancelled") return;
  const res = result as Record<string, unknown> | null;

  const cost = (res?.total_cost_usd as number) ?? undefined;
  const fail = async (msg: string) => {
    await log(job.id, `✗ ${msg}`);
    if ((job.kind === "video" || job.kind === "design") && job.ref_id) await contentBack(job.ref_id);
    await finish(job, "failed", null, msg, started, cost);
  };
  if (!res) return fail(stderr.trim().split("\n").slice(-3).join(" ") || `Claude Code exited with code ${code} and no result`);
  if (res.is_error) {
    const msg = String(res.result || res.subtype || "Agent reported an error");
    if (usageLimited(msg)) {
      // Out of subscription usage for now: put the job back for an hour instead of failing it.
      const at = new Date(Date.now() + 60 * 60_000).toISOString();
      await sql.run("UPDATE jobs SET status = 'queued', not_before = ?, runner_id = NULL WHERE id = ?", at, job.id);
      await log(job.id, `⏸ Claude usage limit reached — retrying after ${at.slice(11, 16)} UTC`);
      throw new UsageLimit();
    }
    return fail(msg);
  }
  try {
    const data = res.structured_output ?? null;
    if (!data) throw new Error("The agent finished but returned no structured output");
    const summary = await applyResult(job, data);
    await log(job.id, `✓ Done in ${Math.round((Date.now() - started) / 1000)}s — ${summary}`);
    await finish(job, "done", summary, null, started, cost);
  } catch (e) {
    await fail((e as Error).message);
  }
}

class UsageLimit extends Error {}

// ---------------------------------------------------------------------------
// Render jobs (paint + voice + Remotion), then upload the finished files to the Worker

async function upload(key: string, file: string) {
  const res = await fetch(`${process.env.HQ_URL}/api/internal/media?key=${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${process.env.HQ_SECRET}` },
    body: fs.readFileSync(file),
  });
  if (!res.ok) throw new Error(`Upload ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

function paletteFor(colors: string[]) {
  const [field, deep, soft, ink] = colors;
  return { field: field || "#1330E0", deep: deep || "#0B1FA8", soft: soft || "#93A6FF", ink: ink || "#FFFFFF" };
}

async function runRender(job: Job) {
  const started = Date.now();
  const c = job.ref_id ? await q.contentItem(job.ref_id) : null;
  const a = c ? await q.account(c.account_id) : null;
  if (!c || !a || !c.production) {
    await log(job.id, "✗ Nothing to render: the piece has no scene plan");
    if (c) await contentBack(c.id);
    return finish(job, "failed", null, "Nothing to render: the piece has no scene plan", started);
  }
  const crypto = await import("node:crypto");
  const planHash = crypto.createHash("sha1").update(JSON.stringify(c.production) + (c.art_style || "")).digest("hex").slice(0, 10);
  const rel = `content-${c.id}/${planHash}`;
  const work = path.join(os.tmpdir(), "agent-hq", rel);
  fs.mkdirSync(work, { recursive: true });
  const charHash = a.character ? crypto.createHash("sha1").update(a.character).digest("hex").slice(0, 8) : "";
  const charRef = a.character ? path.join(os.tmpdir(), "agent-hq", `account-${a.id}`, `character-${charHash}.jpg`) : null;
  // The character reference lives in KV too, so every run (a fresh machine) reuses the same one.
  if (charRef && !fs.existsSync(charRef)) await fetchMedia(`account-${a.id}/character-${charHash}.jpg`, charRef);

  const spec = {
    kind: c.format === "reel" ? "reel" : "slides",
    outDir: work,
    bundleCacheDir: path.join(os.tmpdir(), "agent-hq", "bundles"),
    palette: paletteFor(a.brand_colors),
    handle: a.ig_handle || a.tiktok_handle || a.name.replace(/\s+/g, "").toLowerCase(),
    voice: await q.setting("voice", "af_heart"),
    speed: Number(await q.setting("voice_speed", "1.0")),
    showCaptions: true,
    artStyle: c.art_style || a.art_styles[0] || "ghibli",
    character: a.character || null,
    characterRef: charRef,
    seed: c.id * 7919,
    scenes: c.production.scenes,
  };
  const specPath = path.join(work, "spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  await log(job.id, `▸ Renderer started in the cloud · ${spec.kind} · ${spec.scenes.length} ${spec.kind === "reel" ? "scenes" : "slides"} · style ${spec.artStyle}`);

  const child = spawn(process.execPath, ["scripts/render.mjs", specPath], { cwd: STUDIO, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let buf = "";
  let result: Record<string, unknown> | null = null;
  let errTail = "";
  const pending: Promise<unknown>[] = [];
  child.stdout!.on("data", (d: Buffer) => {
    buf += d.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("PROGRESS ")) {
        const msg = line.slice(9);
        // Skip the 10%-step render lines to keep the log short.
        if (!/^Rendering… [1-9]0%$/.test(msg)) pending.push(log(job.id, `› ${msg}`));
      } else if (line.startsWith("RESULT ")) {
        try {
          result = JSON.parse(line.slice(7));
        } catch {}
      }
    }
  });
  child.stderr!.on("data", (d: Buffer) => (errTail = (errTail + d.toString("utf8")).slice(-2000)));
  await supervise(job, child, RENDER_TIMEOUT_MS);
  await Promise.allSettled(pending);
  if ((await q.job(job.id))?.status === "cancelled") return contentBack(c.id);

  const r = result as { error?: string; quota?: boolean; retryAt?: string; kind?: string; files?: string[]; cover?: string; durationSeconds?: number } | null;
  if (r && !r.error) {
    // Upload only the finished files (not voice tracks or raw paintings) to save KV space.
    const files = [...(r.files ?? []), ...(r.cover && !(r.files ?? []).includes(r.cover) ? [r.cover] : [])];
    for (const f of files) await upload(`${rel}/${f}`, path.join(work, f));
    if (charRef && fs.existsSync(charRef)) await upload(`account-${a.id}/character-${charHash}.jpg`, charRef).catch(() => {});
    const media = { kind: r.kind, files: r.files, cover: r.cover, durationSeconds: r.durationSeconds, dir: rel };
    await sql.run("UPDATE content SET media = ?, status = 'review', updated_at = datetime('now') WHERE id = ?", JSON.stringify(media), c.id);
    const what = r.kind === "reel" ? `${Number(r.durationSeconds).toFixed(0)}s video` : `${(r.files ?? []).length} slide(s)`;
    const summary = `Rendered ${what} — waiting for your final review`;
    await log(job.id, `✓ ${summary}`);
    return finish(job, "done", summary, null, started);
  }
  if (r?.quota) {
    // Free image quota used up: put the render back until the daily reset.
    await sql.run("UPDATE jobs SET status = 'queued', not_before = ?, runner_id = NULL WHERE id = ?", r.retryAt, job.id);
    await log(job.id, `⏸ Paused: today's free image quota is used up. Retrying automatically after ${String(r.retryAt).slice(11, 16)} UTC.`);
    return;
  }
  const msg = r?.error ?? (errTail.trim().split("\n").filter((l) => !/Version mismatch|zod|remotion\.dev|-{5}|To resolve|breakages|^\s*-|^\s*$/.test(l)).slice(-3).join(" ") || "Render failed");
  await log(job.id, `✗ ${msg}`);
  await contentBack(c.id);
  await finish(job, "failed", null, msg, started);
}

async function fetchMedia(key: string, to: string) {
  try {
    const res = await fetch(`${process.env.HQ_URL}/api/media/${key}?sig=internal`, { headers: { Authorization: `Bearer ${process.env.HQ_SECRET}` } });
    if (!res.ok) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, Buffer.from(await res.arrayBuffer()));
  } catch {}
}

// ---------------------------------------------------------------------------

async function main() {
  for (const k of ["HQ_URL", "HQ_SECRET"]) if (!process.env[k]) throw new Error(`${k} is not set`);
  say(`Runner ${RUN_ID} started`);
  await heartbeat();
  let idleSince = Date.now();
  while (Date.now() - STARTED < MAX_RUNTIME_MS) {
    await heartbeat();
    const job = await nextJob();
    if (!job) {
      if (Date.now() - idleSince > IDLE_EXIT_MS) break;
      await sleep(10_000);
      continue;
    }
    say(`Job #${job.id} ${JOB_KINDS[job.kind]?.label ?? job.kind}`);
    try {
      if (job.kind === "render") await runRender(job);
      else await runAgent(job);
    } catch (e) {
      if (e instanceof UsageLimit) {
        say("Claude usage limit reached — stopping until it resets");
        break;
      }
      const msg = (e as Error).message;
      say(`Job #${job.id} crashed: ${msg}`);
      await log(job.id, `✗ ${msg}`).catch(() => {});
      await finish(job, "failed", null, msg, Date.now()).catch(() => {});
      if ((job.kind === "render" || job.kind === "video" || job.kind === "design") && job.ref_id) await contentBack(job.ref_id).catch(() => {});
    }
    idleSince = Date.now();
  }
  await q.setSetting("runner:heartbeat", "");
  say("Runner finished");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
