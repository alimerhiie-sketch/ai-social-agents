import Link from "next/link";
import { notFound } from "next/navigation";
import { q, sql } from "@/lib/db";
import { ART_STYLES, VIDEO_STYLES } from "@/lib/options";
import type { ContentItem, Job } from "@/lib/types";
import { JOB_KINDS } from "@/lib/agents/registry";
import { localDateTime, localTime, prettyDate } from "@/lib/dates";
import { cancelPost, deleteContent, markPosted, postNow, produce, redoProduction, scheduleContent, setContentStatus, updateContentText } from "../../actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, FormatBadge, JobStatusBadge, PageHeader, PlatformBadge, TextLink } from "@/components/ui";

export default async function ContentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await q.contentItem(Number(id));
  if (!it) notFound();
  const account = await q.account(it.account_id);
  const trend = it.trend_id ? await q.trend(it.trend_id) : null;
  const style = VIDEO_STYLES.find((v) => v.id === it.video_style)?.label ?? it.video_style;
  const total = it.script.reduce((s, b) => s + (Number(b.seconds) || 0), 0);
  const fullCaption = `${it.caption}\n\n${it.hashtags.map((h) => `#${h}`).join(" ")}`;
  const lastJob = await sql.get<Job>("SELECT * FROM jobs WHERE ref_id = ? AND kind IN ('video','design','render') ORDER BY id DESC LIMIT 1", it.id);
  const artStyle = ART_STYLES.find((s) => s.id === (it.art_style || account?.art_styles[0]));

  return (
    <>
      <div className="mb-4 text-[13px]">
        <TextLink href={`/pipeline${account ? `?account=${account.id}` : ""}`}>← Pipeline</TextLink>
      </div>
      <PageHeader
        eyebrow={account?.name}
        title={it.title}
        actions={<StatusActions id={it.id} status={it.status} />}
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <FormatBadge format={it.format} />
          <PlatformBadge platform={it.platform} />
          {style && <Badge>{style}</Badge>}
          {it.duration_seconds > 0 && <Badge>{it.duration_seconds}s</Badge>}
          {it.pillar && <Badge>{it.pillar}</Badge>}
          {it.planned_date ? <Badge>{prettyDate(it.planned_date)}</Badge> : it.suggested_day && <Badge>{it.suggested_day}</Badge>}
          {artStyle && <Badge tone="info">{artStyle.label}</Badge>}
          <Badge tone={it.status === "approved" ? "good" : it.status === "rejected" ? "bad" : "accent"}>{it.status}</Badge>
        </span>
      </PageHeader>

      {it.status === "rejected" && it.feedback && (
        <div className="panel mb-6 border-bad/30 p-4 text-sm">
          <span className="text-bad">Your reason:</span> <span className="text-muted">{it.feedback}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {["ready", "scheduled", "posted"].includes(it.status) && <Publishing it={it} />}
          {["approved", "producing", "review", "ready", "scheduled", "posted"].includes(it.status) && <Production it={it} lastJob={lastJob ? { ...lastJob } : null} />}
          <div className="panel p-6">
            <div className="eyebrow mb-2">Hook</div>
            <p className="text-xl font-medium leading-snug tracking-[-0.01em]">{it.hook}</p>
            {it.rationale && <p className="mt-4 text-[13px] leading-relaxed text-muted">{it.rationale}</p>}
            {trend && (
              <p className="mt-3 text-xs text-dim">
                From trend: <span className="text-muted">{trend.title}</span>
              </p>
            )}
          </div>

          {it.script.length > 0 && (
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <div className="eyebrow">Script · {total.toFixed(total % 1 ? 1 : 0)}s</div>
              </div>
              <div className="divide-y divide-line">
                {it.script.map((b, i) => (
                  <div key={i} className="grid gap-3 px-5 py-4 md:grid-cols-[96px_1fr_1fr]">
                    <div>
                      <div className="text-[13px] font-medium text-fg">{b.beat}</div>
                      <div className="font-mono text-xs text-dim">{b.seconds}s</div>
                    </div>
                    <div>
                      <div className="eyebrow mb-1">On screen</div>
                      <p className="text-[14px] font-medium leading-snug text-fg">{b.on_screen_text || "—"}</p>
                      <div className="eyebrow mb-1 mt-3">Visual</div>
                      <p className="text-[13px] leading-relaxed text-muted">{b.visual}</p>
                    </div>
                    <div>
                      <div className="eyebrow mb-1">Voiceover</div>
                      <p className="text-[13px] leading-relaxed text-muted">{b.voiceover || <span className="text-dim">text only</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {it.slides.length > 0 && (
            <div>
              <div className="eyebrow mb-3">{it.format === "carousel" ? `Slides · ${it.slides.length}` : "Design"}</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {it.slides.map((sl, i) => (
                  <div key={i} className="panel flex aspect-[4/5] flex-col p-5">
                    <span className="font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <div className="mt-3 text-[15px] font-semibold leading-snug">{sl.heading}</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">{sl.body}</p>
                    <p className="mt-auto border-t border-line pt-3 text-xs leading-relaxed text-dim">{sl.visual}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Caption</div>
              <CopyButton text={fullCaption} />
            </div>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-fg">{it.caption}</p>
            <p className="mt-3 text-[13px] text-info">{it.hashtags.map((h) => `#${h}`).join(" ")}</p>
            {it.cta && (
              <p className="mt-3 text-xs text-dim">
                CTA: <span className="text-muted">{it.cta}</span>
              </p>
            )}
            {it.audio && (
              <p className="mt-1.5 text-xs text-dim">
                Audio: <span className="text-muted">{it.audio}</span>
              </p>
            )}
          </div>

          <details className="panel p-5">
            <summary className="cursor-pointer text-[13px] text-muted hover:text-fg">Edit text</summary>
            <form action={updateContentText.bind(null, it.id)} className="mt-4 space-y-3">
              <label className="block">
                <span className="label">Hook</span>
                <textarea name="hook" rows={2} defaultValue={it.hook} className="input" />
              </label>
              <label className="block">
                <span className="label">Caption</span>
                <textarea name="caption" rows={6} defaultValue={it.caption} className="input" />
              </label>
              <label className="block">
                <span className="label">Hashtags</span>
                <input name="hashtags" defaultValue={it.hashtags.join(" ")} className="input" />
              </label>
              <label className="block">
                <span className="label">CTA</span>
                <input name="cta" defaultValue={it.cta} className="input" />
              </label>
              <SubmitButton className="btn btn-sm w-full" pending="Saving…">
                Save
              </SubmitButton>
            </form>
          </details>


          <form action={deleteContent.bind(null, it.id)}>
            <SubmitButton className="btn btn-ghost btn-sm text-dim" pending="Deleting…">
              Delete this item
            </SubmitButton>
          </form>
        </aside>
      </div>
    </>
  );
}

async function StatusActions({ id, status }: { id: number; status: string }) {
  if (status === "scripted")
    return (
      <>
        <form action={setContentStatus.bind(null, id, "approved")}>
          <SubmitButton className="btn btn-primary" pending="Approving…">
            Approve
          </SubmitButton>
        </form>
        <details className="relative">
          <summary className="btn list-none">Reject…</summary>
          <form action={setContentStatus.bind(null, id, "rejected")} className="panel absolute right-0 z-10 mt-2 w-72 space-y-3 p-4 shadow-2xl shadow-black/60">
            <label className="block">
              <span className="label">Why? (the Strategist learns from this)</span>
              <textarea name="feedback" rows={3} required placeholder="e.g. Hook is clickbait, topic is off-niche, too long…" className="input" />
            </label>
            <SubmitButton className="btn btn-danger btn-sm w-full" pending="Rejecting…">
              Reject
            </SubmitButton>
          </form>
        </details>
      </>
    );
  if (status === "review")
    return (
      <form action={setContentStatus.bind(null, id, "ready")}>
        <SubmitButton className="btn btn-primary" pending="Approving…">
          Approve for posting
        </SubmitButton>
      </form>
    );
  if (status === "scheduled" || status === "posted") return <Badge tone="good">{status === "posted" ? "Posted" : "Scheduled"}</Badge>;
  if (status === "ready")
    return (
      <>
        <Badge tone="good">Ready to post</Badge>
        <form action={setContentStatus.bind(null, id, "review")}>
          <SubmitButton className="btn btn-ghost">Back to review</SubmitButton>
        </form>
      </>
    );
  if (status === "producing") return null;
  return (
    <form action={setContentStatus.bind(null, id, "scripted")}>
      <SubmitButton className="btn btn-ghost">Move back to review</SubmitButton>
    </form>
  );
}

async function Production({ it, lastJob }: { it: ContentItem; lastJob: Job | null }) {
  const m = it.media;
  const src = (f: string) => `/api/media/${m!.dir}/${f}`;
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="eyebrow">Production</div>
        {lastJob && (
          <Link href={`/agents/jobs/${lastJob.id}`} className="flex items-center gap-2 text-xs text-muted hover:text-fg">
            <JobStatusBadge status={lastJob.status} />
            {JOB_KINDS[lastJob.kind]?.label} · run #{lastJob.id}
          </Link>
        )}
      </div>

      {it.status === "approved" && (
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-relaxed text-muted">
            {it.format === "reel"
              ? "The Video Producer plans illustrated scenes, then the renderer paints them, records the voiceover and renders the MP4."
              : "The Designer plans the slides, then the renderer paints the cover and renders every slide as a JPEG."}
            {lastJob?.status === "failed" && <span className="mt-2 block text-bad">Last attempt failed: {lastJob.error}</span>}
          </p>
          <form action={produce.bind(null, it.id)}>
            <SubmitButton className="btn btn-primary" pending="Queuing…">
              {it.production ? "Render again" : "Produce"}
            </SubmitButton>
          </form>
        </div>
      )}

      {it.status === "producing" && (
        <div className="flex items-center gap-3 p-5 text-[13px] text-muted">
          <span className="live-dot size-2 rounded-full bg-accent" />
          {lastJob?.status === "queued" && lastJob.not_before
            ? `Paused: today's free image quota is used up. It continues automatically at ${localTime(lastJob.not_before)}.`
            : "In production. Watch it live in the run log; this page refreshes when it finishes."}
        </div>
      )}

      {m && ["review", "ready", "scheduled", "posted"].includes(it.status) && (
        <div className="p-5">
          {m.kind === "reel" ? (
            <div className="flex flex-col gap-5 md:flex-row">
              <video
                src={src(m.files[0])}
                poster={m.cover ? src(m.cover) : undefined}
                controls
                playsInline
                className="aspect-[9/16] w-full max-w-[300px] rounded-lg border border-line bg-black"
              />
              <ProductionActions it={it} downloads={[{ label: "Download MP4", href: `${src(m.files[0])}?download` }]} />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex gap-3 overflow-x-auto pb-2">
                {m.files.map((f) => (
                  <a key={f} href={src(f)} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src(f)} alt="" className="aspect-[4/5] w-48 rounded-lg border border-line object-cover" />
                  </a>
                ))}
              </div>
              <ProductionActions it={it} downloads={m.files.map((f, i) => ({ label: `Slide ${i + 1}`, href: `${src(f)}?download` }))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function ProductionActions({ it, downloads }: { it: ContentItem; downloads: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {it.production?.notes && <p className="text-[13px] leading-relaxed text-muted">{it.production.notes}</p>}
      <div className="flex flex-wrap gap-2">
        {downloads.map((d) => (
          <a key={d.href} href={d.href} className="btn btn-sm">
            {d.label}
          </a>
        ))}
      </div>
      <form action={produce.bind(null, it.id)}>
        <SubmitButton className="btn btn-sm btn-ghost" pending="Queuing…">
          Re-render (same plan)
        </SubmitButton>
      </form>
      <form action={redoProduction.bind(null, it.id)} className="space-y-2">
        <textarea name="feedback" rows={2} placeholder="What should change? e.g. warmer scenes, character in every shot, slower…" className="input text-[13px]" />
        <SubmitButton className="btn btn-sm" pending="Queuing…">
          Redo with new images
        </SubmitButton>
      </form>
    </div>
  );
}


async function Publishing({ it }: { it: ContentItem }) {
  const posts = (await q.postsFor(it.id)).filter((p) => p.status !== "cancelled");
  const account = await q.account(it.account_id);
  const igAuto = account ? !!await q.connection(account.id, "instagram") : false;
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="eyebrow">Publishing</div>
        <Link href="/schedule" className="text-xs text-muted hover:text-fg">
          Schedule →
        </Link>
      </div>
      {posts.length === 0 ? (
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-relaxed text-muted">
            Takes the next free {it.format === "reel" ? "video" : "post"} slot on {it.planned_date ? prettyDate(it.planned_date) : "the next day"}.{" "}
            {igAuto ? "Instagram posts automatically" : "Instagram isn't connected yet, so it goes to your phone page"}; TikTok goes to your phone page.
          </p>
          <form action={scheduleContent.bind(null, it.id)}>
            <SubmitButton className="btn btn-primary" pending="Scheduling…">
              Schedule
            </SubmitButton>
          </form>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {posts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
              <Badge tone="info">{p.platform === "instagram" ? "Instagram" : "TikTok"}</Badge>
              <Badge>{p.method === "api" ? "auto" : "phone"}</Badge>
              <span className="font-mono text-muted">
                {localDateTime(p.scheduled_at)}
              </span>
              <Badge tone={p.status === "posted" ? "good" : p.status === "failed" ? "bad" : p.status === "publishing" ? "accent" : "neutral"}>{p.status}</Badge>
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noreferrer" className="text-muted underline underline-offset-4 hover:text-fg">
                  view post
                </a>
              )}
              {p.status !== "posted" && p.status !== "publishing" && (
                <span className="ml-auto flex gap-2">
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
                </span>
              )}
              {p.error && p.status === "failed" && <div className="basis-full text-xs text-bad">{p.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
