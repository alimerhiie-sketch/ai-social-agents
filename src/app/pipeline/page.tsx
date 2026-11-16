import Link from "next/link";
import { q } from "@/lib/db";
import type { ContentItem } from "@/lib/types";
import { AccountFilter } from "@/components/account-filter";
import { SubmitButton } from "@/components/client";
import { produceAllApproved } from "../actions";
import { Badge, FormatBadge, PageHeader, PlatformBadge } from "@/components/ui";
import { prettyDate } from "@/lib/dates";

const COLUMNS: { status: string; title: string; hint: string; phase?: number }[] = [
  { status: "scripted", title: "To review", hint: "Scripts waiting for you" },
  { status: "approved", title: "Approved", hint: "Ready for production" },
  { status: "producing", title: "Producing", hint: "Painting, voicing, rendering" },
  { status: "review", title: "Final review", hint: "Watch it, then approve" },
  { status: "ready", title: "Ready to post", hint: "Schedule it" },
  { status: "scheduled", title: "Scheduled & posted", hint: "Publisher" },
];

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const sp = await searchParams;
  const accountId = sp.account ? Number(sp.account) : undefined;
  const accounts = q.accounts();
  const items = q.content({ accountId, limit: 500 });
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const rejected = items.filter((i) => i.status === "rejected");

  return (
    <>
      <PageHeader eyebrow="Pipeline" title="Pipeline">
        Every piece of content moves left to right. You approve or reject scripts here; rejections and your reasons go
        back to the Strategist so the next batch gets better.
      </PageHeader>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <AccountFilter accounts={accounts} current={accountId} base="/pipeline" />
        {items.some((i) => i.status === "approved") && (
          <form action={produceAllApproved.bind(null, accountId)} className="mb-6">
            <SubmitButton className="btn btn-primary btn-sm" pending="Queuing…">
              Produce all approved ({items.filter((i) => i.status === "approved").length})
            </SubmitButton>
          </form>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        <div className="grid min-w-[1180px] grid-cols-6 gap-3">
          {COLUMNS.map((col) => {
            const list = items.filter((i) => i.status === col.status || (col.status === "scheduled" && i.status === "posted"));
            return (
              <div key={col.status} className={`flex flex-col rounded-xl border border-line ${col.phase ? "bg-transparent" : "bg-panel/60"}`}>
                <div className="flex items-baseline justify-between gap-2 border-b border-line px-3.5 py-3">
                  <div>
                    <div className={`text-[13px] font-medium ${col.phase ? "text-dim" : "text-fg"}`}>{col.title}</div>
                    <div className="text-[11px] text-dim">{col.phase ? `Phase ${col.phase} · ${col.hint}` : col.hint}</div>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-dim">{list.length}</span>
                </div>
                <div className="flex flex-col gap-2 p-2.5">
                  {list.map((it) => (
                    <Card key={it.id} it={it} account={accountId ? null : (names.get(it.account_id) ?? null)} />
                  ))}
                  {list.length === 0 && <div className="px-1 py-6 text-center text-xs text-dim">{col.phase ? "Coming soon" : "Empty"}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {rejected.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-fg">Rejected ({rejected.length})</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {rejected.map((it) => (
              <Card key={it.id} it={it} account={accountId ? null : (names.get(it.account_id) ?? null)} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function Card({ it, account }: { it: ContentItem; account: string | null }) {
  return (
    <Link href={`/pipeline/${it.id}`} className="group block rounded-lg border border-line bg-bg p-3 transition-colors hover:border-line-2">
      <div className="flex flex-wrap items-center gap-1">
        <FormatBadge format={it.format} />
        <PlatformBadge platform={it.platform} />
        {it.planned_date ? <Badge>{prettyDate(it.planned_date)}</Badge> : it.suggested_day && <Badge>{it.suggested_day}</Badge>}
        {it.trend_id && <Badge tone="accent">trend</Badge>}
      </div>
      <div className="mt-2 text-[13px] font-medium leading-snug text-fg group-hover:text-accent">{it.title}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-dim">&ldquo;{it.hook}&rdquo;</div>
      {it.media?.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/media/${it.media.dir}/${it.media.cover}`} alt="" className="mt-2 aspect-[4/5] w-full rounded-md object-cover" />
      )}
      {account && <div className="mt-2 text-[11px] text-dim">{account}</div>}
    </Link>
  );
}
