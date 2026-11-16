import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { VIDEO_STYLES } from "@/lib/options";
import { deleteContent, setContentStatus, updateContentText } from "../../actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, FormatBadge, PageHeader, PlatformBadge, TextLink } from "@/components/ui";

export default async function ContentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = q.contentItem(Number(id));
  if (!it) notFound();
  const account = q.account(it.account_id);
  const trend = it.trend_id ? q.trend(it.trend_id) : null;
  const style = VIDEO_STYLES.find((v) => v.id === it.video_style)?.label ?? it.video_style;
  const total = it.script.reduce((s, b) => s + (Number(b.seconds) || 0), 0);
  const fullCaption = `${it.caption}\n\n${it.hashtags.map((h) => `#${h}`).join(" ")}`;

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
          {it.suggested_day && <Badge>{it.suggested_day}</Badge>}
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

          <div className="rounded-xl border border-dashed border-line-2 p-5">
            <div className="text-[13px] font-medium text-muted">Produce</div>
            <p className="mt-1 text-xs leading-relaxed text-dim">
              Phase 2: approved scripts go to the {it.format === "reel" ? "Video Producer (Remotion render + local voiceover)" : "Designer (Remotion stills)"}.
            </p>
          </div>

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

function StatusActions({ id, status }: { id: number; status: string }) {
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
  return (
    <form action={setContentStatus.bind(null, id, "scripted")}>
      <SubmitButton className="btn btn-ghost">Move back to review</SubmitButton>
    </form>
  );
}
