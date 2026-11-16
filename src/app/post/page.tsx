import { q } from "@/lib/db";
import { nowMs } from "@/lib/dates";
import { captionFor } from "@/lib/publish/schedule";
import { markPosted } from "../actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, Empty, FormatBadge } from "@/components/ui";

// The phone page: open it on your phone (same Wi-Fi), post what's due, tap Posted.
// Shows hand-off posts that are due now or within the next 12 hours.

export default function PhoneQueue() {
  const until = new Date(nowMs() + 12 * 3600_000).toISOString();
  const posts = q.posts({ method: "phone", to: until, statuses: ["scheduled", "failed"] });

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">To post from your phone</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Download the video or slides, copy the caption, post it in the app (add a trending sound), then tap Posted.
      </p>

      <div className="mt-6 space-y-4">
        {posts.length === 0 && <Empty title="Nothing due">You&apos;re all caught up for the next 12 hours.</Empty>}
        {posts.map((p) => {
          const c = q.contentItem(p.content_id);
          const a = q.account(p.account_id);
          if (!c?.media || !a) return null;
          const m = c.media;
          const src = (f: string) => `/api/media/${m.dir}/${f}`;
          const due = new Date(p.scheduled_at).getTime() <= nowMs();
          const caption = captionFor(a, c);
          return (
            <article key={p.id} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
                <Badge tone="info">{p.platform === "tiktok" ? "TikTok" : "Instagram"}</Badge>
                <FormatBadge format={c.format} />
                <Badge tone={due ? "warn" : "neutral"}>
                  {due ? "Due now" : `at ${new Date(p.scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
                </Badge>
                <span className="ml-auto text-xs text-dim">@{p.platform === "tiktok" ? a.tiktok_handle || a.name : a.ig_handle || a.name}</span>
              </div>
              <div className="p-4">
                <div className="text-sm font-medium">{c.title}</div>
                {m.kind === "reel" ? (
                  <video src={src(m.files[0])} poster={m.cover ? src(m.cover) : undefined} controls playsInline className="mt-3 aspect-[9/16] w-full rounded-lg bg-black" />
                ) : (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {m.files.map((f) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={f} src={src(f)} alt="" className="aspect-[4/5] w-40 shrink-0 rounded-lg object-cover" />
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
                    Posted
                  </SubmitButton>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
