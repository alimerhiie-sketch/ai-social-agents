import Link from "next/link";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { localDayLabel, localTime, nowMs } from "@/lib/dates";
import { captionFor } from "@/lib/publish/schedule";
import { creatorInfo, PRIVACY_LABELS, type CreatorInfo, type TikTokOptions } from "@/lib/publish/tiktok";
import { confirmTikTokPost } from "../../../actions";
import { TikTokPostForm } from "@/components/tiktok-post-form";
import { Empty, FormatBadge, PageHeader } from "@/components/ui";

// TikTok post screen: the owner reviews one piece and chooses its TikTok settings. Saving it is the
// consent TikTok requires before an app posts to someone's account.

export default async function TikTokPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await q.post(Number(id));
  if (!p || p.platform !== "tiktok") notFound();
  const c = await q.contentItem(p.content_id);
  const a = await q.account(p.account_id);
  if (!c?.media || !a) notFound();
  const conn = await q.connection(a.id, "tiktok");
  const m = c.media;
  const src = (f: string) => `/api/media/${m.dir}/${f}`;
  const isVideo = m.kind === "reel";

  let info: CreatorInfo | null = null;
  let infoError = "";
  if (conn) {
    try {
      info = await creatorInfo({ connectedAccountId: conn.provider_account_id ?? "", userId: conn.provider_user_id ?? "", igUserId: "" });
    } catch (e) {
      infoError = (e as Error).message;
    }
  }
  const saved = p.tiktok_options ? (JSON.parse(p.tiktok_options) as TikTokOptions) : null;
  const tooLong = !!info?.maxVideoSeconds && isVideo && m.durationSeconds > info.maxVideoSeconds;
  const timeLabel = `${localTime(p.scheduled_at)}, ${localDayLabel(p.scheduled_at)}`;

  return (
    <>
      <PageHeader eyebrow="Publisher · TikTok" title={c.title}>
        <Link href="/schedule" className="text-fg underline decoration-line-2 underline-offset-4">
          Schedule
        </Link>{" "}
        · scheduled for {timeLabel}
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div>
          <div className="mb-2 flex gap-1.5">
            <FormatBadge format={c.format} />
          </div>
          {isVideo ? (
            <video src={src(m.files[0])} poster={m.cover ? src(m.cover) : undefined} controls playsInline className="aspect-[9/16] w-full rounded-xl bg-black" />
          ) : (
            <div className="flex gap-2 overflow-x-auto">
              {m.files.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f} src={src(f)} alt="" className="aspect-[4/5] w-56 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          )}
        </div>

        <div className="panel p-6">
          {p.status === "posted" ? (
            <Empty title="Already posted">{p.permalink ? <a href={p.permalink}>{p.permalink}</a> : "This piece is live on TikTok."}</Empty>
          ) : !conn ? (
            <Empty title="TikTok isn't connected">
              Connect TikTok on the <Link href={`/accounts/${a.id}`}>account page</Link> first.
            </Empty>
          ) : !info ? (
            <Empty title="Couldn't reach TikTok">{infoError || "TikTok didn't return the account's posting options."} Try again in a minute.</Empty>
          ) : info.privacyOptions.length === 0 ? (
            <Empty title="TikTok isn't accepting posts from this account right now">
              TikTok returned no posting options (this happens when the account has reached its posting limit). Try again later.
            </Empty>
          ) : tooLong ? (
            <Empty title="Video too long for this account">
              The video is {Math.round(m.durationSeconds)}s; TikTok currently allows this account up to {info.maxVideoSeconds}s.
            </Empty>
          ) : (
            <TikTokPostForm
              action={confirmTikTokPost.bind(null, p.id)}
              creator={{ nickname: info.nickname, username: info.username, avatar: info.avatar }}
              privacyOptions={info.privacyOptions.map((v) => ({ value: v, label: PRIVACY_LABELS[v] ?? v }))}
              locked={{ comment: info.commentDisabled, duet: info.duetDisabled, stitch: info.stitchDisabled }}
              isVideo={isVideo}
              defaults={{
                title: saved?.title ?? c.title.slice(0, 90),
                caption: saved?.caption ?? captionFor(a, c),
                privacy: saved?.privacy_level && info.privacyOptions.includes(saved.privacy_level) ? saved.privacy_level : "",
                comment: saved?.allow_comment ?? false,
                duet: saved?.allow_duet ?? false,
                stitch: saved?.allow_stitch ?? false,
                disclose: !!(saved?.brand_organic || saved?.brand_content),
                brandOrganic: saved?.brand_organic ?? false,
                brandContent: saved?.brand_content ?? false,
                aigc: saved?.is_aigc ?? true,
              }}
              overdue={new Date(p.scheduled_at).getTime() <= nowMs()}
              timeLabel={timeLabel}
            />
          )}
        </div>
      </div>
    </>
  );
}
