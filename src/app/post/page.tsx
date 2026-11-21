import { q } from "@/lib/db";
import { localDayLabel, localTime, nowMs } from "@/lib/dates";
import { captionFor } from "@/lib/publish/schedule";
import { markPosted } from "../actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, Empty, FormatBadge } from "@/components/ui";
import type { Account, ContentItem, Post } from "@/lib/types";

// The phone page: everything to post by hand in the next 7 days, grouped by day, each with its slot
// time. Either post when it's due, or sit down once and schedule the whole week inside the
// Instagram / TikTok apps using the times shown, then tap "Scheduled" on each card.

export default async function PhoneQueue() {
  const now = nowMs();
  const until = new Date(now + 7 * 86400_000).toISOString();
  const posts = await q.posts({ method: "phone", to: until, statuses: ["scheduled", "failed"] });
  const items = new Map<number, ContentItem | null>();
  const accounts = new Map<number, Account | null>();
  for (const p of posts) {
    if (!items.has(p.content_id)) items.set(p.content_id, await q.contentItem(p.content_id));
    if (!accounts.has(p.account_id)) accounts.set(p.account_id, await q.account(p.account_id));
  }

  const days = new Map<string, Post[]>();
  for (const p of posts) {
    const d = localDayLabel(p.scheduled_at);
    days.set(d, [...(days.get(d) ?? []), p]);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">To post from your phone</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        {posts.length} post{posts.length === 1 ? "" : "s"} in the next 7 days. For each: download, copy the caption, then post it in the app — or
        schedule it there for the time shown and tap <span className="text-fg">Scheduled</span>.
      </p>
      <details className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-muted">
        <summary className="cursor-pointer text-fg">How to schedule in the apps</summary>
        <p className="mt-2">
          <span className="text-fg">Instagram:</span> make the post as usual, then on the last screen open <span className="text-fg">More options /
          Advanced settings → Schedule</span> and pick the time.
        </p>
        <p className="mt-2">
          <span className="text-fg">TikTok:</span> on the posting screen tap <span className="text-fg">More options → Schedule</span> (the clock) and
          pick the time. Add a trending sound before you schedule.
        </p>
      </details>

      <div className="mt-6 space-y-8">
        {posts.length === 0 && <Empty title="Nothing to post">You&apos;re all caught up for the next 7 days.</Empty>}
        {[...days.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="sticky top-0 z-10 -mx-1 mb-3 bg-bg/95 px-1 py-2 text-sm font-semibold backdrop-blur">{day}</h2>
            <div className="space-y-4">
              {list.map((p) => {
                const c = items.get(p.content_id);
                const a = accounts.get(p.account_id);
                if (!c?.media || !a) return null;
                const m = c.media;
                const src = (f: string) => `/api/media/${m.dir}/${f}`;
                const due = new Date(p.scheduled_at).getTime() <= now;
                const time = localTime(p.scheduled_at);
                const caption = captionFor(a, c);
                return (
                  <article key={p.id} className="panel overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
                      <span className="font-mono text-sm tabular-nums text-fg">{time}</span>
                      <Badge tone="info">{p.platform === "tiktok" ? "TikTok" : "Instagram"}</Badge>
                      <FormatBadge format={c.format} />
                      {due && <Badge tone="warn">Due now</Badge>}
                      <span className="ml-auto text-xs text-dim">@{p.platform === "tiktok" ? a.tiktok_handle || a.name : a.ig_handle || a.name}</span>
                    </div>
                    <div className="p-4">
                      <div className="text-sm font-medium">{c.title}</div>
                      {m.kind === "reel" ? (
                        <video
                          src={src(m.files[0])}
                          poster={m.cover ? src(m.cover) : undefined}
                          controls
                          playsInline
                          preload="none"
                          className="mt-3 aspect-[9/16] w-full rounded-lg bg-black"
                        />
                      ) : (
                        <div className="mt-3 flex gap-2 overflow-x-auto">
                          {m.files.map((f) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={f} src={src(f)} alt="" loading="lazy" className="aspect-[4/5] w-40 shrink-0 rounded-lg object-cover" />
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.files.map((f, i) => (
                          <a key={f} href={`${src(f)}?download`} className="btn btn-sm">
                            {m.kind === "reel" ? "Download video" : `Slide ${i + 1}`}
                          </a>
                        ))}
                      </div>
                      <div className="mt-4 rounded-lg border border-line bg-bg p-3">
                        <div className="flex items-center justify-between">
                          <span className="eyebrow">Caption</span>
                          <CopyButton text={caption} />
                        </div>
                        <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-fg">{caption}</p>
                        {c.audio && <p className="mt-2 text-xs text-dim">Sound: {c.audio}</p>}
                      </div>
                      <form action={markPosted.bind(null, p.id)} className="mt-4 flex gap-2">
                        <input name="link" placeholder="Post link (optional)" className="input text-[13px]" />
                        <SubmitButton className="btn btn-primary" pending="…">
                          {due ? "Posted" : "Scheduled"}
                        </SubmitButton>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
