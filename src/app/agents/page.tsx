import Link from "next/link";
import { q } from "@/lib/db";
import { AGENTS, JOB_KINDS } from "@/lib/agents/registry";
import { modelFor } from "@/lib/agents/runner";
import { MODELS } from "@/lib/options";
import { cancelJob, setAgentModel } from "../actions";
import { CliBanner, SubmitButton } from "@/components/client";
import { Badge, duration, JobStatusBadge, PageHeader, Section, timeAgo } from "@/components/ui";
import { prettyDate } from "@/lib/dates";

export default function Agents() {
  const jobs = q.jobs({ limit: 60 });
  const names = new Map(q.accounts().map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader eyebrow="Agents" title="The team">
        Each agent is a Claude Code agent file in <code className="text-fg">.claude/agents/</code>, run headless on your
        Claude subscription. One runs at a time to stay inside your usage limits. Heavier models give better work but use
        more of your limit.
      </PageHeader>

      <CliBanner />

      <Section title="Agents">
        <div className="panel divide-y divide-line">
          {AGENTS.map((ag) => (
            <div key={ag.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${ag.status === "planned" ? "text-muted" : "text-fg"}`}>{ag.name}</span>
                  {ag.status === "active" ? <Badge tone="accent">Live</Badge> : ag.status === "basic" ? <Badge tone="info">Basic</Badge> : <Badge>Phase {ag.phase}</Badge>}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-dim">{ag.role}</p>
                {ag.tools.length > 0 && <p className="mt-1 text-[11px] text-dim">Tools: {ag.tools.join(", ")}</p>}
              </div>
              {ag.status === "active" && (
                <div className="flex flex-col gap-2">
                  <ModelPicker settingKey={`model:${ag.id}`} current={modelFor(ag.id)} label={ag.id === "strategist" ? "Strategy" : undefined} />
                  {ag.id === "strategist" && <ModelPicker settingKey={`model:${ag.id}:scripts`} current={modelFor(ag.id, "plan")} label="Daily scripts" />}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Runs">
        {jobs.length === 0 ? (
          <div className="text-sm text-dim">No runs yet. Start one from an account page.</div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-dim">
                <tr>
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 font-medium">Result</th>
                  <th className="px-4 py-2.5 font-medium">Model</th>
                  <th className="px-4 py-2.5 font-medium">Took</th>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.map((j) => (
                  <tr key={j.id} className="transition-colors hover:bg-panel-2">
                    <td className="px-4 py-3 font-mono text-xs text-dim">
                      <Link href={`/agents/jobs/${j.id}`} className="hover:text-fg">
                        {j.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <JobStatusBadge status={j.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/agents/jobs/${j.id}`} className="text-fg hover:text-accent">
                        {JOB_KINDS[j.kind]?.label}
                        {j.target_date && <span className="text-muted"> · {prettyDate(j.target_date)}</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{j.account_id ? names.get(j.account_id) : "—"}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-muted" title={j.summary ?? j.error ?? ""}>
                      {j.summary ?? (j.error ? <span className="text-bad">{j.error}</span> : "—")}
                    </td>
                    <td className="px-4 py-3 text-muted">{j.model ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{duration(j.duration_ms)}</td>
                    <td className="px-4 py-3 text-xs text-dim">{timeAgo(j.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {(j.status === "queued" || j.status === "running") && (
                        <form action={cancelJob.bind(null, j.id)}>
                          <SubmitButton className="btn btn-ghost btn-sm" pending="…">
                            Cancel
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function ModelPicker({ settingKey, current, label }: { settingKey: string; current: string; label?: string }) {
  return (
    <form action={setAgentModel.bind(null, settingKey)} className="flex items-center gap-2">
      {label && <span className="w-24 text-right text-xs text-dim">{label}</span>}
      <select name="model" defaultValue={current} className="input h-9 w-auto py-0 text-[13px]">
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <SubmitButton className="btn btn-sm" pending="…">
        Save
      </SubmitButton>
    </form>
  );
}
