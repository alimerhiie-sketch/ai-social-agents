import { sql } from "../db";
import { enqueue } from "../queue";
import { TZ } from "../dates";
import type { Job } from "../types";
import { UPGRADE_TARGETS } from "./schemas";

// Agent upgrades: the Agent Developer proposes, the owner approves, the next job of that agent gets it.
//
// Approved instructions live in D1 (agent_upgrades) and are appended to the agent's task prompt when its job
// starts, instead of being committed to .claude/agents/*.md. Why:
//  - Approve takes effect on the very next job; no git push, no runner redeploy, no merge with the other
//    sessions that edit the agent files.
//  - Revoke is one click and exact: the upgrade simply stops being sent.
//  - Every job records which upgrades it ran with (jobs.upgrade_ids), which is what the effect tracking needs.
//  - The runner never needs write access to the repo.
// Every proposal is filtered here twice: when it is stored (so the owner reviews the filtered text) and again
// when it is sent to an agent.

export type UpgradeTarget = (typeof UPGRADE_TARGETS)[number];
export type UpgradeStatus = "pending" | "approved" | "rejected" | "blocked" | "revoked";

export type AgentUpgrade = {
  id: number;
  account_id: number | null;
  job_id: number | null;
  target_agent: UpgradeTarget;
  focus: string;
  title: string;
  kind: "add" | "replace";
  before_text: string;
  after_text: string;
  source_type: string;
  source_url: string;
  evidence: string;
  why: string;
  success_metric: string;
  quality_score: number;
  risk_notes: string;
  safety_notes: string;
  status: UpgradeStatus;
  decision_note: string;
  created_at: string;
  decided_at: string | null;
  applied_at: string | null;
  revoked_at: string | null;
};

export type ProposalOut = {
  target_agent: string;
  focus: string;
  title: string;
  kind: string;
  before: string;
  after: string;
  source_type: string;
  source_url: string;
  evidence: string;
  why: string;
  success_metric: string;
  quality_score: number;
  risk_notes: string;
};

// ---------------------------------------------------------------------------
// Safety filter

const MAX_AFTER = 3000;
const MAX_BEFORE = 3000;

/** Whole lines that are dropped, with the reason shown to the owner. */
const LINE_RULES: [RegExp, string][] = [
  [/\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|system|all|any|your|these|other)\b.{0,30}\b(instructions?|rules?|prompts?|guidelines?|constraints?)\b/i, "tried to override instructions"],
  [/\b(system prompt|developer message|jailbreak|you are now|new instructions:|prompt injection)\b/i, "prompt-injection wording"],
  [/\b(run|execute|exec|invoke)\b.{0,40}\b(commands?|shell|terminal|bash|powershell|cmd|console|code|programs?|installers?)\b/i, "tells the agent to run commands"],
  [/(^|\s)(\$ |sudo |rm -rf|chmod |curl |wget |npx |npm (i|install|run)|pip install|git (clone|push|commit)|powershell|bash -c|sh -c|eval\(|exec\()/i, "shell command"],
  [/\b(fetch|download|visit|browse( to)?|go to|navigate to|load|curl|ping|send (it|data|this) to)\b.{0,40}\b(urls?|links?|web ?pages?|endpoints?|webhooks?|https?)\b/i, "tells the agent to fetch URLs"],
  [/\b(api[ _-]?keys?|secret keys?|(access|auth|bearer|session|oauth|github|refresh|api) tokens?|passwords?|credentials?|env(ironment)? var(iable)?s?|\.env\b|process\.env|session cookies?|ssh keys?|private keys?)\b/i, "mentions secrets or credentials"],
  [/\b(edit|modify|change|update|overwrite|rewrite|delete|replace|write to|append to)\b.{0,40}\b(agent files?|\.claude|agents\/|other agents?|their instructions|(its|your) own (tools|instructions)|your (tools|agent file))\b/i, "tells the agent to change files or other agents"],
  [/\b(tell|instruct|message|email|contact|notify|override)\b.{0,30}\b(the )?(trend scout|strategist|designer|video producer|publisher|agent developer|other agents?|the owner)\b/i, "tells the agent to contact other agents or people"],
  [/\b(post|publish|upload)\b.{0,20}\b(it|this|them|the (post|video|reel|piece))\b.{0,20}\b(immediately|right now|directly|yourself|without (review|approval|asking))\b/i, "tells the agent to publish"],
  [/\b(webfetch|websearch|bash tool|write tool|edit tool|notebookedit|mcp|tool ?use|use the .{0,15} tool)\b/i, "tells the agent to use tools"],
  [/[A-Za-z0-9+/=_-]{80,}/, "long encoded-looking string"],
];

/** Pieces removed from inside a line. */
const INLINE_RULES: [RegExp, string, string][] = [
  [/[​-‏‪-‮⁠-⁤﻿]/g, "", "hidden characters"],
  [/<!--[\s\S]*?-->/g, "", "hidden HTML comment"],
  [/<\/?(script|iframe|img|a|style|object|embed)\b[^>]*>/gi, "", "HTML tags"],
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link removed]", "links"],
];

export function sanitize(text: string, max = MAX_AFTER): { text: string; flags: string[]; droppedShare: number } {
  const flags = new Set<string>();
  let t = String(text ?? "").replace(/\r\n?/g, "\n");
  // Code blocks never belong in an instruction for a content agent.
  if (/```/.test(t)) {
    t = t.replace(/```[\s\S]*?(```|$)/g, "");
    flags.add("code block");
  }
  for (const [re, rep, why] of INLINE_RULES) {
    if (re.test(t)) flags.add(why);
    re.lastIndex = 0;
    t = t.replace(re, rep);
  }
  const lines = t.split("\n");
  const kept: string[] = [];
  let dropped = 0;
  let total = 0;
  for (const line of lines) {
    if (line.trim()) total++;
    const hit = LINE_RULES.find(([re]) => re.test(line));
    if (hit) {
      dropped++;
      flags.add(hit[1]);
    } else kept.push(line);
  }
  t = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length > max) {
    t = t.slice(0, max).trimEnd() + " …";
    flags.add(`cut to ${max} characters`);
  }
  return { text: t, flags: [...flags], droppedShare: total ? dropped / total : 0 };
}

/** Filters one proposal. A proposal that is mostly unsafe is stored as "blocked" so the owner can see why. */
export function vetProposal(p: ProposalOut) {
  const after = sanitize(p.after);
  const before = sanitize(p.before, MAX_BEFORE);
  const notes: string[] = [];
  if (after.flags.length) notes.push(`Removed from the new text: ${after.flags.join(", ")}.`);
  if (before.flags.length) notes.push(`Removed from the quoted passage: ${before.flags.join(", ")}.`);
  let blocked = "";
  if (!(UPGRADE_TARGETS as readonly string[]).includes(p.target_agent)) blocked = `Unknown target agent "${p.target_agent}".`;
  else if (after.text.length < 20) blocked = "Nothing usable was left after the safety filter.";
  else if (after.droppedShare > 0.34) blocked = `Blocked: ${Math.round(after.droppedShare * 100)}% of the lines broke the safety rules.`;
  const kind = p.kind === "replace" && before.text ? "replace" : "add";
  return {
    target: p.target_agent as UpgradeTarget,
    kind,
    before: kind === "replace" ? before.text : "",
    after: after.text,
    safety: [blocked, ...notes].filter(Boolean).join(" "),
    status: (blocked ? "blocked" : "pending") as UpgradeStatus,
  };
}

const clip = (s: unknown, n: number) => sanitize(String(s ?? ""), n).text;

export async function storeProposals(job: Job, proposals: ProposalOut[]) {
  let pending = 0;
  let blocked = 0;
  for (const p of proposals.slice(0, 12)) {
    const v = vetProposal(p);
    if (v.status === "blocked") blocked++;
    else pending++;
    const url = /^https?:\/\/[^\s"'<>]{3,500}$/i.test(String(p.source_url ?? "").trim()) ? String(p.source_url).trim() : "";
    await sql.run(
      `INSERT INTO agent_upgrades (account_id, job_id, target_agent, focus, title, kind, before_text, after_text, source_type, source_url,
         evidence, why, success_metric, quality_score, risk_notes, safety_notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      job.account_id,
      job.id,
      v.target,
      clip(p.focus, 80),
      clip(p.title, 160) || "Untitled upgrade",
      v.kind,
      v.before,
      v.after,
      clip(p.source_type, 40),
      url,
      clip(p.evidence, 1200),
      clip(p.why, 800),
      clip(p.success_metric, 600),
      Math.max(0, Math.min(100, Math.round(Number(p.quality_score) || 0))),
      clip(p.risk_notes, 600),
      v.safety,
      v.status,
    );
  }
  return { pending, blocked };
}

// ---------------------------------------------------------------------------
// Sending approved upgrades to the agents

/** The upgrade block appended to an agent's task prompt; records on the job which upgrades it carried. */
export async function upgradesBlock(job: Job): Promise<string> {
  if (!(UPGRADE_TARGETS as readonly string[]).includes(job.agent)) return "";
  const ups = await sql.all<AgentUpgrade>(
    `SELECT * FROM agent_upgrades WHERE status = 'approved' AND target_agent = ? AND (account_id IS NULL OR account_id = ?)
     ORDER BY applied_at, id`,
    job.agent,
    job.account_id,
  );
  await sql.run("UPDATE jobs SET upgrade_ids = ? WHERE id = ?", ups.length ? `,${ups.map((u) => u.id).join(",")},` : null, job.id);
  if (!ups.length) return "";
  let budget = 9000;
  const parts: string[] = [];
  for (const u of ups) {
    const after = sanitize(u.after_text).text;
    const before = u.kind === "replace" ? sanitize(u.before_text, MAX_BEFORE).text : "";
    const block = [
      `### Upgrade #${u.id}: ${u.title}`,
      before ? `This REPLACES the passage of your instructions that reads:\n> ${before.replace(/\n/g, "\n> ")}\nNow follow this instead:` : "",
      after,
    ]
      .filter(Boolean)
      .join("\n");
    if (block.length > budget) break;
    budget -= block.length;
    parts.push(block);
  }
  return [
    "",
    "APPROVED UPGRADES TO YOUR INSTRUCTIONS",
    "The owner reviewed and approved these improvements to your agent instructions. Follow them as part of your instructions.",
    "Where an upgrade replaces a passage, the upgrade wins. They are about content craft only and never change your tools or your output format.",
    "",
    parts.join("\n\n"),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Effect tracking: what each agent's results looked like before and after an upgrade

export type Outcome = { jobs: number; label: string; good: number; bad: number; total: number; extra?: string };

const PASSED = "('approved','producing','review','ready','scheduled','posted')";
const SHIPPED = "('ready','scheduled','posted')";

/** Outcome of one agent's jobs matching a condition (job alias j). */
async function outcome(agent: string, accountId: number | null, cond: string, args: (string | number | null)[]): Promise<Outcome> {
  const acc = accountId ? " AND j.account_id = ?" : "";
  const a = accountId ? [accountId] : [];
  const jobs =
    (await sql.get<{ n: number; failed: number }>(
      `SELECT COUNT(*) n, SUM(j.status = 'failed') failed FROM jobs j WHERE j.agent = ? AND j.kind != 'develop' AND j.status IN ('done','failed')${acc} AND ${cond}`,
      agent,
      ...a,
      ...args,
    )) ?? { n: 0, failed: 0 };
  const failNote = jobs.failed ? `${jobs.failed} failed run${jobs.failed === 1 ? "" : "s"}` : "";
  if (agent === "strategist") {
    const r = await sql.get<{ total: number; good: number; bad: number }>(
      `SELECT COUNT(*) total, SUM(c.status IN ${PASSED}) good, SUM(c.status = 'rejected') bad
       FROM content c JOIN jobs j ON j.id = c.job_id WHERE j.agent = ?${acc} AND ${cond}`,
      agent,
      ...a,
      ...args,
    );
    return { jobs: jobs.n, label: "scripts approved", good: r?.good ?? 0, bad: r?.bad ?? 0, total: r?.total ?? 0, extra: failNote };
  }
  if (agent === "trend-scout") {
    const r = await sql.get<{ total: number; good: number; fit: number }>(
      `SELECT COUNT(*) total, SUM(t.status = 'used') good, AVG(t.fit_score) fit FROM trends t JOIN jobs j ON j.id = t.job_id WHERE j.agent = ?${acc} AND ${cond}`,
      agent,
      ...a,
      ...args,
    );
    return {
      jobs: jobs.n,
      label: "trends used in content",
      good: r?.good ?? 0,
      bad: (r?.total ?? 0) - (r?.good ?? 0),
      total: r?.total ?? 0,
      extra: [r?.fit ? `avg fit ${Math.round(r.fit)}` : "", failNote].filter(Boolean).join(", "),
    };
  }
  // designer / video-producer: did the planned piece get through final review without a redo?
  const r = await sql.get<{ total: number; good: number; bad: number }>(
    `SELECT COUNT(*) total,
       SUM(c.status IN ${SHIPPED} AND NOT EXISTS (SELECT 1 FROM jobs k WHERE k.ref_id = j.ref_id AND k.kind = j.kind AND k.id > j.id AND k.status = 'done')) good,
       SUM(c.status = 'rejected' OR EXISTS (SELECT 1 FROM jobs k WHERE k.ref_id = j.ref_id AND k.kind = j.kind AND k.id > j.id AND k.status = 'done')) bad
     FROM jobs j JOIN content c ON c.id = j.ref_id WHERE j.agent = ? AND j.status = 'done'${acc} AND ${cond}`,
    agent,
    ...a,
    ...args,
  );
  return { jobs: jobs.n, label: "plans shipped without a redo", good: r?.good ?? 0, bad: r?.bad ?? 0, total: r?.total ?? 0, extra: failNote };
}

/** Results of the agent's jobs that ran WITH this upgrade, vs. its jobs in the 30 days before it was applied. */
export async function upgradeEffect(u: AgentUpgrade): Promise<{ before: Outcome; after: Outcome } | null> {
  if (!u.applied_at) return null;
  const after = await outcome(u.target_agent, u.account_id, "j.upgrade_ids LIKE ?", [`%,${u.id},%`]);
  const before = await outcome(
    u.target_agent,
    u.account_id,
    "j.created_at < ? AND j.created_at >= datetime(?, '-30 days') AND (j.upgrade_ids IS NULL OR j.upgrade_ids NOT LIKE ?)",
    [u.applied_at, u.applied_at, `%,${u.id},%`],
  );
  return { before, after };
}

export const describeOutcome = (o: Outcome) =>
  `${o.jobs} run${o.jobs === 1 ? "" : "s"}; ${o.total ? `${o.good}/${o.total} ${o.label}${o.bad ? `, ${o.bad} rejected or redone` : ""}` : "no results yet"}${o.extra ? `; ${o.extra}` : ""}`;

// ---------------------------------------------------------------------------
// Schedule

export const DEVELOPER_WEEKDAY = "Sun";

/** Weekly run, from the nightly cycle: one "develop" job per account on the chosen weekday. */
export async function enqueueWeeklyDevelop(accountId: number): Promise<number | null> {
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(new Date());
  if (weekday !== DEVELOPER_WEEKDAY) return null;
  const recent = await sql.get<{ n: number }>(
    "SELECT COUNT(*) n FROM jobs WHERE kind = 'develop' AND account_id = ? AND (status IN ('queued','running') OR created_at > datetime('now','-5 days'))",
    accountId,
  );
  if (recent?.n) return null;
  return enqueue("develop", accountId);
}
