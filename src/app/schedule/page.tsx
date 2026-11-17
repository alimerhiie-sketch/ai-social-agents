import Link from "next/link";
import { q } from "@/lib/db";
import { localDayLabel, localTime, nowMs } from "@/lib/dates";
import type { Post } from "@/lib/types";
import { cancelPost, markPosted, postNow, scheduleAllReady } from "../actions";
import { AccountFilter } from "@/components/account-filter";
import { SubmitButton } from "@/components/client";
import { Badge, Empty, FormatBadge, PageHeader, Section } from "@/components/ui";

const STATUS_TONE = { scheduled: "neutral", publishing: "accent", posted: "good", failed: "bad", cancelled: "neutral" } as const;

export default async function Schedule({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const sp = await searchParams;
  const accountId = sp.account ? Number(sp.account) : undefined;
  const accounts = await q.accounts();
  const since = new Date(nowMs() - 36 * 3600_000).toISOString();
  const posts = await q.posts({ accountId, from: since, statuses: ["scheduled", "publishing", "posted", "failed"] });
  const ready = await q.content({ accountId, status: "ready", limit: 500 });
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const items = new Map(await Promise.all([...new Set(posts.map((p) => p.content_id))].map(async (id) => [id, await q.contentItem(id)] as const)));

  const days = new Map<string, Post[]>();
  for (const p of posts) {
    const d = localDayLabel(p.scheduled_at);
    days.set(d, [...(days.get(d) ?? []), p]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Publisher"
        title="Schedule"
        actions={
          ready.length > 0 && (
            <form action={scheduleAllReady.bind(null, accountId)}>
              <SubmitButton className="btn btn-primary" pending="Scheduling…">
                Schedule all ready ({ready.length})
              </SubmitButton>
            </form>
          )
        }
      >
        Connected Instagram accounts post automatically at their time (checked every 5 minutes, in the cloud). Everything else waits on your{" "}
        <Link href="/post" className="text-fg underline decoration-line-2 underline-offset-4">
          phone page
        </Link>
        , which works from anywhere: open this dashboard on your phone and log in once.
      </PageHeader>

      <AccountFilter accounts={accounts} current={accountId} base="/schedule" />

      {posts.length === 0 ? (
        <Empty title="Nothing scheduled">Approve rendered pieces in the Pipeline&apos;s final review, then schedule them here.</Empty>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <Section key={day} title={day}>
            <div className="panel divide-y divide-line">
              {list.map((p) => {
                const c = items.get(p.content_id);
                const due = p.status === "scheduled" && new Date(p.scheduled_at).getTime() <= nowMs();
                return (
                  <div key={p.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                    <div className="w-14 shrink-0 font-mono text-sm tabular-nums text-fg">
                      {localTime(p.scheduled_at)}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Badge tone="info">{p.platform === "instagram" ? "IG" : "TikTok"}</Badge>
                      <Badge>{p.method === "api" ? "auto" : "phone"}</Badge>
                      {c && <FormatBadge format={c.format} />}
                    </div>
                    <Link href={`/pipeline/${p.content_id}`} className="min-w-0 flex-1 truncate text-sm hover:text-accent">
                      {c?.title ?? `#${p.content_id}`}
                      {!accountId && <span className="text-dim"> · {names.get(p.account_id)}</span>}
                    </Link>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={due && p.method === "phone" ? "warn" : STATUS_TONE[p.status]}>{due && p.method === "phone" ? "due" : p.status}</Badge>
                      {p.permalink && (
                        <a href={p.permalink} target="_blank" rel="noreferrer" className="text-xs text-muted underline underline-offset-4 hover:text-fg">
                          view
                        </a>
                      )}
                      {p.status !== "posted" && p.status !== "publishing" && (
                        <>
                          {p.method === "api" ? (
                            <form action={postNow.bind(null, p.id)}>
                              <SubmitButton className="btn btn-sm">{p.status === "failed" ? "Retry now" : "Post now"}</SubmitButton>
                            </form>
                          ) : (
                            <form action={markPosted.bind(null, p.id)}>
                              <SubmitButton className="btn btn-sm">Mark posted</SubmitButton>
                            </form>
                          )}
                          <form action={cancelPost.bind(null, p.id)}>
                            <SubmitButton className="btn btn-ghost btn-sm">Cancel</SubmitButton>
                          </form>
                        </>
                      )}
                    </div>
                    {p.error && p.status === "failed" && <div className="text-xs text-bad md:basis-full">{p.error}</div>}
                  </div>
                );
              })}
            </div>
          </Section>
        ))
      )}
    </>
  );
}
