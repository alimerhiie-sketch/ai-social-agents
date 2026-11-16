import Link from "next/link";
import { q } from "@/lib/db";
import { contentFromTrend, runJob, setTrendStatus } from "../actions";
import { AccountFilter } from "@/components/account-filter";
import { SubmitButton } from "@/components/client";
import { Badge, Empty, FitScore, FormatBadge, PageHeader, PlatformBadge, timeAgo } from "@/components/ui";

const MOMENTUM_TONE: Record<string, "accent" | "good" | "warn" | "neutral" | "info"> = {
  rising: "accent",
  peaking: "good",
  upcoming: "info",
  fading: "warn",
  evergreen: "neutral",
};

export default async function Trends({ searchParams }: { searchParams: Promise<{ account?: string; status?: string }> }) {
  const sp = await searchParams;
  const accountId = sp.account ? Number(sp.account) : undefined;
  const status = sp.status === "used" || sp.status === "dismissed" ? sp.status : "new";
  const accounts = q.accounts();
  const trends = q.trends({ accountId, status });
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const scanTarget = accountId ?? (accounts.length === 1 ? accounts[0].id : undefined);

  return (
    <>
      <PageHeader
        eyebrow="Trend Scout"
        title="Trends"
        actions={
          scanTarget && (
            <form action={runJob.bind(null, "trends", scanTarget)}>
              <SubmitButton className="btn btn-primary" pending="Starting…">
                Scan for trends
              </SubmitButton>
            </form>
          )
        }
      >
        What&apos;s happening right now, scored for fit against each account. Turn the good ones into a script with one click.
      </PageHeader>

      <AccountFilter accounts={accounts} current={accountId} base="/trends" extra={status !== "new" ? `status=${status}` : ""} />

      <div className="mb-6 flex gap-4 border-b border-line text-[13px]">
        {(["new", "used", "dismissed"] as const).map((s) => (
          <Link
            key={s}
            href={`/trends?${accountId ? `account=${accountId}&` : ""}status=${s}`}
            className={`-mb-px border-b pb-2.5 capitalize transition-colors ${status === s ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {s === "new" ? "Fresh" : s}
          </Link>
        ))}
      </div>

      {trends.length === 0 ? (
        <Empty title={status === "new" ? "No fresh trends" : `Nothing ${status}`}>
          {status === "new" ? "Run the Trend Scout from an account page or with the button above." : null}
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {trends.map((t) => (
            <article key={t.id} className="panel flex flex-col p-5">
              <div className="flex items-start gap-4">
                <FitScore score={t.fit_score} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={MOMENTUM_TONE[t.momentum] ?? "neutral"}>{t.momentum}</Badge>
                    <Badge>{t.time_sensitivity}</Badge>
                    <FormatBadge format={t.format} />
                    <PlatformBadge platform={t.platform} />
                  </div>
                  <h3 className="mt-2 text-[15px] font-medium leading-snug">{t.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{t.summary}</p>
              <div className="mt-3 rounded-lg border border-line bg-bg p-3">
                <div className="eyebrow mb-1">Our angle</div>
                <p className="text-[13px] leading-relaxed text-fg">{t.angle}</p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-dim">
                <span className="text-muted">Why it fits:</span> {t.fit_reason}
              </p>
              {t.risk_notes && (
                <p className="mt-1.5 text-xs leading-relaxed text-warn/90">
                  <span className="text-warn">Risk:</span> {t.risk_notes}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                {t.status === "new" ? (
                  <>
                    <form action={contentFromTrend.bind(null, t.id)}>
                      <SubmitButton className="btn btn-sm btn-primary" pending="Starting…">
                        Script this
                      </SubmitButton>
                    </form>
                    <form action={setTrendStatus.bind(null, t.id, "dismissed")}>
                      <SubmitButton className="btn btn-sm btn-ghost">Dismiss</SubmitButton>
                    </form>
                  </>
                ) : t.status === "dismissed" ? (
                  <form action={setTrendStatus.bind(null, t.id, "new")}>
                    <SubmitButton className="btn btn-sm btn-ghost">Restore</SubmitButton>
                  </form>
                ) : (
                  <Badge tone="good">Scripted</Badge>
                )}
                <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-dim">
                  {!accountId && <span className="truncate">{names.get(t.account_id)} ·</span>}
                  {t.source_url ? (
                    <a href={t.source_url} target="_blank" rel="noreferrer" className="truncate underline decoration-line-2 underline-offset-4 hover:text-fg">
                      {t.source || "source"}
                    </a>
                  ) : (
                    <span className="truncate">{t.source}</span>
                  )}
                  <span className="shrink-0">· {timeAgo(t.created_at)}</span>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
