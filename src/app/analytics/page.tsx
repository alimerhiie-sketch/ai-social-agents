import Link from "next/link";
import { q, sql } from "@/lib/db";
import { addDays, localDateTime, nowMs, todayLocal } from "@/lib/dates";
import { accountSeries, computeStats, currentMix, latestReport, postsWithMetrics, REVIEW_WEEKDAY, type MetricRow } from "@/lib/analytics/review";
import { ART_STYLES } from "@/lib/options";
import { SubmitButton } from "@/components/client";
import { FollowerChart } from "@/components/follower-chart";
import { AnalysisReport, BriefCard } from "@/components/reports";
import { Badge, Empty, FormatBadge, JobStatusBadge, PageHeader, Section, timeAgo } from "@/components/ui";
import { refreshInsights, runReview } from "./actions";
import type { Job } from "@/lib/types";

const styleLabel = (id: string) => ART_STYLES.find((s) => s.id === id)?.label ?? (id || "—");
const n = (v: number | null | undefined) => (v == null ? "–" : v.toLocaleString("en-GB"));

export default async function Analytics({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const sp = await searchParams;
  const accounts = await q.accounts();
  const a = accounts.find((x) => x.id === Number(sp.account)) ?? accounts[0];
  if (!a) return <Empty title="No accounts yet">Set up an account first.</Empty>;

  const now = nowMs();
  const week = await postsWithMetrics(a.id, new Date(now - 7 * 86400_000).toISOString());
  const posts = await postsWithMetrics(a.id, new Date(now - 30 * 86400_000).toISOString());
  const series = await accountSeries(a.id, 60);
  const stats = computeStats(week, []);
  const followerPoints = series.filter((d) => d.followers != null).map((d) => ({ date: d.date, followers: d.followers! }));
  const weekAgo = followerPoints.find((p) => p.date >= addDays(todayLocal(), -8));
  const followersNow = followerPoints.at(-1)?.followers ?? null;
  const report = await latestReport(a.id, "analysis");
  const brief = await latestReport(a.id, "brief");
  const mix = await currentMix(a);
  const conn = await q.connection(a.id, "instagram");
  const runs = await sql.all<Job>("SELECT * FROM jobs WHERE kind IN ('analyze','brief') AND account_id = ? ORDER BY id DESC LIMIT 4", a.id);
  const lastRead = await sql.get<{ at: string }>("SELECT MAX(fetched_at) at FROM post_metrics WHERE account_id = ?", a.id);

  return (
    <>
      <PageHeader
        eyebrow="Analyst"
        title="Analytics"
        actions={
          <>
            <form action={refreshInsights}>
              <SubmitButton className="btn" pending="Reading…">
                Read due insights
              </SubmitButton>
            </form>
            <form action={runReview.bind(null, a.id)}>
              <SubmitButton className="btn btn-primary" pending="Queuing…">
                Run weekly review now
              </SubmitButton>
            </form>
          </>
        }
      >
        Instagram insights for every post at about 1 hour, 24 hours, 3 days and 7 days after it goes out, and the follower
        count once a day. Every {REVIEW_WEEKDAY === "Sun" ? "Sunday" : REVIEW_WEEKDAY} night the Analyst reviews the week and the
        Manager briefs you and sets next week&apos;s mix. TikTok is measured once it&apos;s connected; until then its posts go
        out by hand and have no numbers here.
      </PageHeader>

      {accounts.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-1">
          {accounts.map((x) => (
            <Link
              key={x.id}
              href={`/analytics?account=${x.id}`}
              className={`rounded-lg border px-3 py-1.5 text-[13px] ${x.id === a.id ? "border-line-2 bg-panel-2 text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {x.name}
            </Link>
          ))}
        </div>
      )}

      {!conn && <div className="mb-6 text-sm text-warn">Instagram isn&apos;t connected for {a.name}, so there are no insights to read.</div>}

      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Followers" value={n(followersNow)} sub={weekAgo && followersNow != null ? `${followersNow - weekAgo.followers >= 0 ? "+" : ""}${followersNow - weekAgo.followers} this week` : "daily snapshot"} />
        <Tile label="Views · 7 days" value={n(stats.views)} sub={`${stats.tracked} of ${stats.posts} posts measured`} />
        <Tile label="Reach · 7 days" value={n(stats.reach)} sub="summed per post" />
        <Tile label="Interactions" value={n(stats.interactions)} sub="likes, comments, saves, shares" />
        <Tile label="Saves + shares" value={n(stats.saves + stats.shares)} sub="the strongest signals" />
        <Tile label="Views per reel" value={stats.byFormat.reel ? n(Math.round(stats.byFormat.reel.views / stats.byFormat.reel.pieces)) : "–"} sub={stats.byFormat.reel ? `${stats.byFormat.reel.pieces} reels` : "no reels yet"} />
      </div>

      <Section title="Followers">
        <div className="panel p-4 sm:p-5">
          <FollowerChart points={followerPoints} />
        </div>
      </Section>

      <Section title="This week's review" aside={runs.length > 0 && <RunsLine runs={runs} />}>
        {report || brief ? (
          <div className="flex flex-col gap-4">
            {brief && <BriefCard brief={brief} mix={mix} />}
            {report && <AnalysisReport report={report} />}
          </div>
        ) : (
          <Empty title="No weekly review yet">
            The first one runs on {REVIEW_WEEKDAY === "Sun" ? "Sunday" : REVIEW_WEEKDAY} night, or press Run weekly review now.
          </Empty>
        )}
      </Section>

      <Section title={`Posts · last 30 days (${posts.length})`} aside={<span className="text-[12px] text-dim">Insights last read {timeAgo(lastRead?.at ?? null)}</span>}>
        {posts.length === 0 ? (
          <div className="text-sm text-dim">Nothing posted yet.</div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-dim">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Posted</th>
                  <th className="px-4 py-2.5 font-medium">Piece</th>
                  <th className="px-3 py-2.5 font-medium">Read at</th>
                  {["Views", "Reach", "Likes", "Comm.", "Saves", "Shares", "Follows"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-right font-medium">
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-medium" title="Reels: share of views that skipped in the first 3 seconds">
                    Skip
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium" title="Reels: average watch time">
                    Watch
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {posts.map((p) => {
                  const m = p.latest;
                  return (
                    <tr key={p.post_id} className="align-top transition-colors hover:bg-panel-2">
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{localDateTime(p.posted_at)}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/pipeline/${p.content_id}`} className="line-clamp-1 max-w-[280px] text-fg hover:text-accent">
                          {p.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
                          <FormatBadge format={p.format} />
                          {p.platform === "tiktok" && <Badge tone="info">TikTok</Badge>}
                          <span>{styleLabel(p.art_style)}</span>
                          {p.permalink && (
                            <a href={p.permalink} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-2 hover:text-fg">
                              open
                            </a>
                          )}
                        </div>
                      </td>
                      {p.platform !== "instagram" ? (
                        <td colSpan={10} className="px-3 py-2.5 text-[12px] text-dim">
                          Posted by hand — measured once TikTok is connected
                        </td>
                      ) : !p.remote_id ? (
                        <td colSpan={10} className="px-3 py-2.5 text-[12px] text-dim">
                          Marked posted by hand — no Instagram media id to read
                        </td>
                      ) : !m ? (
                        <td colSpan={10} className="px-3 py-2.5 text-[12px] text-dim">
                          {p.snapshots.find((s) => s.error) ? `Couldn't read: ${p.snapshots.find((s) => s.error)!.error!.slice(0, 120)}` : "First read about an hour after posting"}
                        </td>
                      ) : (
                        <MetricCells m={m} />
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function MetricCells({ m }: { m: MetricRow }) {
  const cell = "px-3 py-2.5 text-right font-mono tabular-nums text-muted";
  return (
    <>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-dim" title={`${m.age_hours} hours after posting`}>
        {m.checkpoint}
      </td>
      <td className={`${cell} text-fg`}>{n(m.views)}</td>
      <td className={cell}>{n(m.reach)}</td>
      <td className={cell}>{n(m.likes)}</td>
      <td className={cell}>{n(m.comments)}</td>
      <td className={cell}>{n(m.saves)}</td>
      <td className={cell}>{n(m.shares)}</td>
      <td className={cell}>{n(m.follows)}</td>
      <td className={cell}>{m.skip_rate == null ? "–" : `${m.skip_rate}%`}</td>
      <td className={`${cell} pr-4`}>{m.avg_watch_ms == null ? "–" : `${(m.avg_watch_ms / 1000).toFixed(1)}s`}</td>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-panel p-4">
      <div className="text-[11px] text-dim">{label}</div>
      <div className="mt-1 font-mono text-[22px] tabular-nums tracking-[-0.02em] text-fg">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-dim">{sub}</div>
    </div>
  );
}

function RunsLine({ runs }: { runs: Job[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-dim">
      {runs.slice(0, 2).map((j) => (
        <Link key={j.id} href={`/agents/jobs/${j.id}`} className="flex items-center gap-1.5 hover:text-fg">
          <JobStatusBadge status={j.status} />
          {j.kind === "analyze" ? "Analyst" : "Manager"} #{j.id}
        </Link>
      ))}
    </div>
  );
}
