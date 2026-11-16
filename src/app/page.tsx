import Link from "next/link";
import { q } from "@/lib/db";
import { AGENTS, JOB_KINDS } from "@/lib/agents/registry";
import { runCycle } from "./actions";
import { CliBanner, SubmitButton } from "@/components/client";
import { Badge, Empty, JobStatusBadge, PageHeader, Section, TextLink, timeAgo } from "@/components/ui";

export default function Overview() {
  const accounts = q.accounts();
  const jobs = q.jobs({ limit: 8 });

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Your content operation"
        actions={
          <Link href="/accounts/new" className="btn btn-primary">
            New account
          </Link>
        }
      >
        Each account has its own profile. The agents scout trends, plan the week and write every script. Nothing goes
        further until you approve it.
      </PageHeader>

      <CliBanner />

      <Section title="Accounts">
        {accounts.length === 0 ? (
          <Empty
            title="No accounts yet"
            action={
              <Link href="/accounts/new" className="btn btn-primary">
                Set up your first account
              </Link>
            }
          >
            Pick a niche, the content types you want and the tone. The Strategist builds the plan from that.
          </Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => {
              const c = q.counts(a.id);
              return (
                <div key={a.id} className="panel flex flex-col p-5">
                  <Link href={`/accounts/${a.id}`} className="group">
                    <div className="flex items-center gap-2">
                      {a.brand_colors.slice(0, 3).map((col) => (
                        <span key={col} className="size-2.5 rounded-full" style={{ background: col }} />
                      ))}
                      <span className="text-[15px] font-medium group-hover:text-accent">{a.name}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[13px] text-muted">{a.niche || "No niche set"}</div>
                  </Link>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                    <Stat n={c.newTrends} label="new trends" href={`/trends?account=${a.id}`} />
                    <Stat n={c.scripted} label="to review" href={`/pipeline?account=${a.id}`} highlight={c.scripted > 0} />
                    <Stat n={c.approved} label="approved" href={`/pipeline?account=${a.id}`} />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    {a.strategy ? <Badge tone="good">Strategy ready</Badge> : <Badge tone="warn">No strategy yet</Badge>}
                    <form action={runCycle.bind(null, a.id)}>
                      <SubmitButton className="btn btn-sm" pending="Queuing…">
                        Run weekly cycle
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="The team" aside={<TextLink href="/agents">Manage agents</TextLink>}>
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((ag) => (
            <div key={ag.id} className="bg-panel p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[13px] font-medium ${ag.status === "planned" ? "text-muted" : "text-fg"}`}>{ag.name}</span>
                {ag.status === "active" ? <Badge tone="accent">Live</Badge> : ag.status === "basic" ? <Badge tone="info">Basic</Badge> : <Badge>Phase {ag.phase}</Badge>}
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-dim">{ag.role}</p>
            </div>
          ))}
          <div className="hidden bg-panel lg:block" />
        </div>
      </Section>

      <Section title="Recent agent runs" aside={jobs.length > 0 && <TextLink href="/agents">All runs</TextLink>}>
        {jobs.length === 0 ? (
          <div className="text-sm text-dim">No runs yet.</div>
        ) : (
          <div className="panel divide-y divide-line">
            {jobs.map((j) => (
              <Link key={j.id} href={`/agents/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-panel-2">
                <JobStatusBadge status={j.status} />
                <span className="text-fg">{JOB_KINDS[j.kind]?.label}</span>
                <span className="hidden truncate text-muted sm:inline">{j.summary ?? j.error ?? ""}</span>
                <span className="ml-auto shrink-0 text-xs text-dim">{timeAgo(j.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Stat({ n, label, href, highlight }: { n: number; label: string; href: string; highlight?: boolean }) {
  return (
    <Link href={href} className="rounded-lg py-1 transition-colors hover:bg-panel-2">
      <div className={`font-mono text-lg tabular-nums ${highlight ? "text-accent" : "text-fg"}`}>{n}</div>
      <div className="text-[11px] text-dim">{label}</div>
    </Link>
  );
}
