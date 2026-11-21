import { sql } from "../db";
import type { Account, Job } from "../types";
import { TZ } from "../dates";
import { agentById } from "./registry";
import { UPGRADE_TARGETS } from "./schemas";
import { describeOutcome, upgradeEffect, type AgentUpgrade } from "./upgrades";

// The Agent Developer's task prompt: everything it needs to coach the other agents, from our own data.
// Runs on the GitHub Actions runner (Node), which has the repo checked out, so it reads the agent files directly.

const cut = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

async function agentFile(id: string): Promise<string> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const raw = await fs.readFile(path.join(process.cwd(), ".claude", "agents", `${id}.md`), "utf8");
    return raw.replace(/^---[\s\S]*?---\s*/, "").trim();
  } catch {
    return "(agent file not available)";
  }
}

export async function developerPrompt(job: Job, a: Account): Promise<string> {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });

  // --- Results and the owner's feedback -----------------------------------------------------------
  const byStatus = await sql.all<{ status: string; format: string; n: number }>(
    "SELECT status, format, COUNT(*) n FROM content WHERE account_id = ? AND created_at > datetime('now','-45 days') GROUP BY status, format ORDER BY status",
    a.id,
  );
  const rejected = await sql.all<{ id: number; title: string; format: string; hook: string; feedback: string }>(
    "SELECT id, title, format, hook, feedback FROM content WHERE account_id = ? AND status = 'rejected' ORDER BY updated_at DESC LIMIT 15",
    a.id,
  );
  const notes = await sql.all<{ id: number; title: string; format: string; status: string; feedback: string }>(
    "SELECT id, title, format, status, feedback FROM content WHERE account_id = ? AND status != 'rejected' AND feedback != '' ORDER BY updated_at DESC LIMIT 15",
    a.id,
  );
  const redos = await sql.all<{ ref_id: number; kind: string; n: number; title: string }>(
    `SELECT j.ref_id, j.kind, COUNT(*) n, c.title FROM jobs j JOIN content c ON c.id = j.ref_id
     WHERE j.account_id = ? AND j.kind IN ('video','design') AND j.status = 'done' AND j.created_at > datetime('now','-45 days')
     GROUP BY j.ref_id, j.kind HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 10`,
    a.id,
  );
  const posted = await sql.all<{ id: number; title: string; format: string; hook: string; platform: string; permalink: string | null; posted_at: string | null }>(
    `SELECT c.id, c.title, c.format, c.hook, p.platform, p.permalink, p.posted_at FROM posts p JOIN content c ON c.id = p.content_id
     WHERE p.account_id = ? AND p.status = 'posted' ORDER BY p.posted_at DESC LIMIT 12`,
    a.id,
  );
  const failed = await sql.all<{ id: number; agent: string; kind: string; error: string }>(
    "SELECT id, agent, kind, error FROM jobs WHERE account_id = ? AND status = 'failed' AND created_at > datetime('now','-30 days') AND kind != 'render' ORDER BY id DESC LIMIT 12",
    a.id,
  );
  const failedRenders = await sql.all<{ id: number; error: string }>(
    "SELECT id, error FROM jobs WHERE account_id = ? AND status = 'failed' AND kind = 'render' AND created_at > datetime('now','-30 days') ORDER BY id DESC LIMIT 5",
    a.id,
  );

  // --- Samples of each agent's recent output --------------------------------------------------------
  const trends = await sql.all<{ job_id: number; title: string; fit_score: number; status: string; angle: string }>(
    "SELECT job_id, title, fit_score, status, angle FROM trends WHERE account_id = ? ORDER BY id DESC LIMIT 12",
    a.id,
  );
  const scripts = await sql.all<{ id: number; job_id: number; status: string; format: string; title: string; hook: string; caption: string; hashtags: string; script: string; slides: string }>(
    "SELECT id, job_id, status, format, title, hook, caption, hashtags, script, slides FROM content WHERE account_id = ? ORDER BY id DESC LIMIT 4",
    a.id,
  );
  const reelPlan = await sql.get<{ id: number; title: string; status: string; production: string }>(
    "SELECT id, title, status, production FROM content WHERE account_id = ? AND format = 'reel' AND production IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
    a.id,
  );
  const slidePlan = await sql.get<{ id: number; title: string; status: string; production: string }>(
    "SELECT id, title, status, production FROM content WHERE account_id = ? AND format != 'reel' AND production IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
    a.id,
  );

  // --- Upgrades so far ------------------------------------------------------------------------------
  const ups = await sql.all<AgentUpgrade>(
    "SELECT * FROM agent_upgrades WHERE account_id IS NULL OR account_id = ? ORDER BY id DESC LIMIT 60",
    a.id,
  );
  const applied = ups.filter((u) => u.status === "approved" || u.status === "revoked");
  const appliedLines: string[] = [];
  for (const u of applied) {
    const eff = await upgradeEffect(u);
    appliedLines.push(
      `- #${u.id} [${u.target_agent}] ${u.status === "revoked" ? "REVOKED" : "ACTIVE"} since ${String(u.applied_at).slice(0, 10)} — ${u.title}\n` +
        `  text: ${cut(u.after_text, 400)}\n` +
        `  success metric: ${cut(u.success_metric, 200)}\n` +
        (eff ? `  before (30 days): ${describeOutcome(eff.before)}\n  with it: ${describeOutcome(eff.after)}` : ""),
    );
  }

  const agentsText: string[] = [];
  for (const id of UPGRADE_TARGETS) agentsText.push(`### ${agentById(id)?.name ?? id} (${id})\n\n${await agentFile(id)}`);

  const sec = (title: string, lines: string[], empty = "(none)") => [title, ...(lines.length ? lines : [empty]), ""].join("\n");

  return [
    `Today is ${today}. This is the weekly training run for the agents of one account. Study the evidence, research, then propose upgrades.`,
    "",
    "ACCOUNT",
    JSON.stringify(
      {
        name: a.name,
        niche: a.niche,
        audience: a.audience,
        language: a.language,
        platforms: a.platforms,
        handles: { instagram: a.ig_handle, tiktok: a.tiktok_handle },
        daily_output: `${a.reels_per_day} reel(s) + ${a.posts_per_day} feed post(s) a day`,
        tones: a.tones,
        art_styles: a.art_styles,
        has_mascot: !!a.character,
        topics_to_avoid: a.avoid,
        positioning: a.strategy?.positioning ?? "(no strategy yet)",
        pillars: a.strategy?.pillars.map((p) => p.name) ?? [],
        voice: a.strategy?.voice ?? null,
      },
      null,
      2,
    ),
    "",
    "=== EVIDENCE: RESULTS AND OWNER FEEDBACK ===",
    "",
    sec("Content in the last 45 days by status (scripted → approved → producing → review → ready → scheduled → posted, or rejected):", byStatus.map((r) => `- ${r.status} · ${r.format}: ${r.n}`)),
    sec("Rejected by the owner (with the reason they gave):", rejected.map((c) => `- #${c.id} [${c.format}] ${c.title} — hook "${cut(c.hook, 120)}" — reason: ${cut(c.feedback, 300) || "(no reason given)"}`)),
    sec("Owner notes on pieces (edits and redo requests):", notes.map((c) => `- #${c.id} [${c.format}, ${c.status}] ${c.title} — "${cut(c.feedback, 300)}"`)),
    sec("Pieces whose video/slide plan had to be redone:", redos.map((r) => `- #${r.ref_id} ${r.title}: ${r.kind} planned ${r.n} times`)),
    sec(
      "Posted (views, saves and shares are not collected yet, so judge by what got approved and posted):",
      posted.map((p) => `- #${p.id} [${p.format}, ${p.platform}] ${p.title} — hook "${cut(p.hook, 120)}" — ${String(p.posted_at ?? "").slice(0, 10)}${p.permalink ? ` ${p.permalink}` : ""}`),
    ),
    sec("Failed agent runs in the last 30 days:", failed.map((j) => `- job #${j.id} ${j.agent}/${j.kind}: ${cut(j.error, 240)}`)),
    sec("Failed renders (often a plan the renderer could not draw):", failedRenders.map((j) => `- job #${j.id}: ${cut(j.error, 200)}`)),
    "=== SAMPLES OF RECENT OUTPUT ===",
    "",
    sec("Trend Scout — latest trends (fit score, status used/new/dismissed):", trends.map((t) => `- job #${t.job_id} [${t.fit_score}, ${t.status}] ${t.title} — angle: ${cut(t.angle, 160)}`)),
    sec(
      "Strategist — latest scripts:",
      scripts.map(
        (c) =>
          `- #${c.id} (job #${c.job_id}) [${c.format}, ${c.status}] ${c.title}\n  hook: ${cut(c.hook, 200)}\n  caption: ${cut(c.caption, 400)}\n  hashtags: ${cut(c.hashtags, 120)}\n  ${c.format === "reel" ? `script: ${cut(c.script, 900)}` : `slides: ${cut(c.slides, 900)}`}`,
      ),
    ),
    sec("Video Producer — latest reel plan:", reelPlan ? [`- #${reelPlan.id} [${reelPlan.status}] ${reelPlan.title}\n  ${cut(reelPlan.production, 2200)}`] : []),
    sec("Designer — latest slide plan:", slidePlan ? [`- #${slidePlan.id} [${slidePlan.status}] ${slidePlan.title}\n  ${cut(slidePlan.production, 1500)}`] : []),
    "=== UPGRADES SO FAR ===",
    "",
    sec("Applied (and their measured effect — judge them; propose a replace if one hurt):", appliedLines, "(none yet — this is the first training run)"),
    sec("Waiting for the owner's decision (do not duplicate):", ups.filter((u) => u.status === "pending").map((u) => `- #${u.id} [${u.target_agent}] ${u.title}`)),
    sec(
      "Rejected by the owner or blocked (do not re-propose unless the evidence changed):",
      ups.filter((u) => u.status === "rejected" || u.status === "blocked").map((u) => `- #${u.id} [${u.target_agent}] ${u.title}${u.decision_note ? ` — owner: "${cut(u.decision_note, 200)}"` : ""}`),
    ),
    "=== THE AGENTS' CURRENT INSTRUCTIONS ===",
    "(For a replace proposal, copy the `before` passage exactly from here or from an applied upgrade.)",
    "",
    agentsText.join("\n\n"),
    "",
    `Now research and return 3–8 upgrade proposals as structured output (job #${job.id}).`,
  ].join("\n");
}
