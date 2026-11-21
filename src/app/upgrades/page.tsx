import Link from "next/link";
import { q, sql } from "@/lib/db";
import { agentById } from "@/lib/agents/registry";
import { describeOutcome, upgradeEffect, DEVELOPER_WEEKDAY, type AgentUpgrade } from "@/lib/agents/upgrades";
import { SubmitButton } from "@/components/client";
import { Badge, Empty, JobStatusBadge, PageHeader, Section, timeAgo } from "@/components/ui";
import { approveUpgrade, rejectUpgrade, revokeUpgrade, runAgentDeveloper } from "./actions";
import type { Job } from "@/lib/types";

const agentName = (id: string) => agentById(id)?.name ?? id;

export default async function Upgrades() {
  const accounts = await q.accounts();
  const ups = await sql.all<AgentUpgrade>("SELECT * FROM agent_upgrades ORDER BY id DESC LIMIT 200");
  const runs = await sql.all<Job>("SELECT * FROM jobs WHERE kind = 'develop' ORDER BY id DESC LIMIT 6");
  const pending = ups.filter((u) => u.status === "pending").sort((a, b) => b.quality_score - a.quality_score);
  const active = ups.filter((u) => u.status === "approved");
  const history = ups.filter((u) => u.status === "rejected" || u.status === "blocked" || u.status === "revoked");
  const effects = new Map(await Promise.all(active.map(async (u) => [u.id, await upgradeEffect(u)] as const)));

  return (
    <>
      <PageHeader
        eyebrow="Agent Developer"
        title="Upgrades"
        actions={accounts.map((a) => (
          <form key={a.id} action={runAgentDeveloper.bind(null, a.id)}>
            <SubmitButton className="btn btn-primary" pending="Queuing…">
              Run now{accounts.length > 1 ? ` · ${a.name}` : ""}
            </SubmitButton>
          </form>
        ))}
      >
        Every {DEVELOPER_WEEKDAY === "Sun" ? "Sunday" : DEVELOPER_WEEKDAY} night the Agent Developer researches skills and techniques for each agent and
        studies their recent work against your approvals, rejections and notes. It proposes exact changes to their
        instructions. Nothing changes until you approve it here; an approved upgrade goes to that agent from its next job,
        and you can revoke it any time. Text from the web passes a safety filter that removes commands, links, secrets and
        instructions aimed at other agents.
      </PageHeader>

      <Section title={`Waiting for you (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty title="No proposals waiting">The next run is on {DEVELOPER_WEEKDAY === "Sun" ? "Sunday" : DEVELOPER_WEEKDAY} night, or press Run now.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((u) => (
              <Proposal key={u.id} u={u} />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Applied (${active.length})`}>
        {active.length === 0 ? (
          <div className="text-sm text-dim">No upgrades applied yet.</div>
        ) : (
          <div className="panel divide-y divide-line">
            {active.map((u) => {
              const eff = effects.get(u.id);
              return (
                <div key={u.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="good">{agentName(u.target_agent)}</Badge>
                      <span className="text-sm font-medium text-fg">
                        #{u.id} {u.title}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-dim">Applied {timeAgo(u.applied_at)} · success metric: {u.success_metric || "—"}</p>
                    {eff && (
                      <dl className="mt-2 grid gap-1 text-[12px] text-muted sm:grid-cols-[110px_1fr]">
                        <dt className="text-dim">30 days before</dt>
                        <dd>{describeOutcome(eff.before)}</dd>
                        <dt className="text-dim">With it</dt>
                        <dd>{describeOutcome(eff.after)}</dd>
                      </dl>
                    )}
                    <details className="mt-2 text-[12px]">
                      <summary className="cursor-pointer text-dim hover:text-fg">What the agent receives</summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-panel-2 p-3 font-sans text-[12.5px] leading-relaxed text-fg">{u.after_text}</pre>
                    </details>
                  </div>
                  <form action={revokeUpgrade.bind(null, u.id)}>
                    <SubmitButton className="btn btn-ghost btn-sm" pending="…">
                      Revoke
                    </SubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Agent Developer runs">
        {runs.length === 0 ? (
          <div className="text-sm text-dim">No runs yet.</div>
        ) : (
          <div className="panel divide-y divide-line text-[13px]">
            {runs.map((j) => (
              <Link key={j.id} href={`/agents/jobs/${j.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-panel-2">
                <span className="font-mono text-xs text-dim">#{j.id}</span>
                <JobStatusBadge status={j.status} />
                <span className="min-w-0 flex-1 truncate text-muted">{j.summary ?? j.error ?? "—"}</span>
                <span className="text-xs text-dim">{timeAgo(j.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {history.length > 0 && (
        <Section title={`History (${history.length})`}>
          <div className="panel divide-y divide-line">
            {history.map((u) => (
              <details key={u.id} className="px-5 py-3 text-[13px]">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <Badge tone={u.status === "blocked" ? "bad" : "neutral"}>{u.status}</Badge>
                  <span className="text-dim">{agentName(u.target_agent)}</span>
                  <span className="text-fg">
                    #{u.id} {u.title}
                  </span>
                  {u.decision_note && <span className="text-dim">— “{u.decision_note}”</span>}
                </summary>
                {u.safety_notes && <p className="mt-2 text-[12px] text-warn">{u.safety_notes}</p>}
                <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-panel-2 p-3 font-sans text-[12.5px] leading-relaxed text-muted">{u.after_text}</pre>
              </details>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function Proposal({ u }: { u: AgentUpgrade }) {
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{agentName(u.target_agent)}</Badge>
        {u.focus && <Badge>{u.focus}</Badge>}
        <Badge tone="info">{u.kind === "replace" ? "Rewrites a passage" : "Adds a rule"}</Badge>
        <span className="ml-auto text-[12px] text-dim">confidence {u.quality_score}/100 · proposed {timeAgo(u.created_at)}</span>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-fg">
        #{u.id} {u.title}
      </h3>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-[13px] leading-relaxed sm:grid-cols-[96px_1fr]">
        <dt className="text-dim">Why</dt>
        <dd className="text-muted">{u.why}</dd>
        <dt className="text-dim">Evidence</dt>
        <dd className="text-muted">{u.evidence || "—"}</dd>
        <dt className="text-dim">Source</dt>
        <dd className="min-w-0 break-words text-muted">
          {u.source_type}
          {u.source_url && (
            <>
              {" · "}
              <a href={u.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-info hover:underline">
                {u.source_url}
              </a>
            </>
          )}
        </dd>
        <dt className="text-dim">Measured by</dt>
        <dd className="text-muted">{u.success_metric || "—"}</dd>
        {u.risk_notes && (
          <>
            <dt className="text-dim">Risks</dt>
            <dd className="text-muted">{u.risk_notes}</dd>
          </>
        )}
      </dl>
      {u.safety_notes && <p className="mt-3 rounded-lg border border-warn/30 px-3 py-2 text-[12px] text-warn">Safety filter: {u.safety_notes}</p>}

      <form action={approveUpgrade.bind(null, u.id)} className="mt-4">
        <div className={`grid gap-3 ${u.kind === "replace" ? "lg:grid-cols-2" : ""}`}>
          {u.kind === "replace" && (
            <div>
              <div className="label mb-1.5">Before (current instructions)</div>
              <pre className="h-full max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel-2 p-3 font-sans text-[12.5px] leading-relaxed text-muted line-through decoration-bad/40">
                {u.before_text}
              </pre>
            </div>
          )}
          <div>
            <label className="label mb-1.5 block" htmlFor={`after-${u.id}`}>
              {u.kind === "replace" ? "After (what the agent will receive — you can edit it)" : "New instruction (what the agent will receive — you can edit it)"}
            </label>
            <textarea id={`after-${u.id}`} name="after_text" defaultValue={u.after_text} rows={Math.min(16, Math.max(6, Math.ceil(u.after_text.length / 90)))} className="input w-full font-sans text-[12.5px] leading-relaxed" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input name="note" placeholder="Note (optional)" className="input h-9 min-w-0 flex-1 py-0 text-[13px]" />
          <SubmitButton className="btn btn-primary btn-sm" pending="Approving…">
            Approve
          </SubmitButton>
          <button formAction={rejectUpgrade.bind(null, u.id)} className="btn btn-ghost btn-sm">
            Reject
          </button>
        </div>
      </form>
    </article>
  );
}
