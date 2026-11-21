"use client";

import { useState } from "react";
import { SubmitButton } from "./client";

// The posting screen TikTok's Content Sharing Guidelines require for Direct Post: who is posting,
// a preview, editable caption, privacy with no default, interaction settings off by default (and
// locked when the creator disabled them), commercial content disclosure, and the consent line.

type Props = {
  action: (fd: FormData) => Promise<void>;
  creator: { nickname: string; username: string; avatar: string };
  privacyOptions: { value: string; label: string }[];
  locked: { comment: boolean; duet: boolean; stitch: boolean };
  isVideo: boolean;
  defaults: {
    title: string;
    caption: string;
    privacy: string;
    comment: boolean;
    duet: boolean;
    stitch: boolean;
    disclose: boolean;
    brandOrganic: boolean;
    brandContent: boolean;
    aigc: boolean;
  };
  overdue: boolean;
  timeLabel: string;
};

export function TikTokPostForm({ action, creator, privacyOptions, locked, isVideo, defaults, overdue, timeLabel }: Props) {
  const [privacy, setPrivacy] = useState(defaults.privacy);
  const [disclose, setDisclose] = useState(defaults.disclose);
  const [organic, setOrganic] = useState(defaults.brandOrganic);
  const [branded, setBranded] = useState(defaults.brandContent);
  const [postNow, setPostNow] = useState(overdue);

  const discloseIncomplete = disclose && !organic && !branded;
  const brandedPrivate = branded && privacy === "SELF_ONLY";
  const ready = !!privacy && !discloseIncomplete && !brandedPrivate;
  const kind = isVideo ? "video" : "photo";

  return (
    <form action={action} className="space-y-5">
      <div className="flex items-center gap-3">
        {creator.avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
        )}
        <div className="text-[13px] text-muted">
          Posting to <span className="text-fg">{creator.nickname || creator.username}</span>
          {creator.username && <span className="text-dim"> @{creator.username}</span>}
        </div>
      </div>

      {!isVideo && (
        <label className="block">
          <span className="eyebrow">Title</span>
          <input name="title" defaultValue={defaults.title} maxLength={90} className="input mt-1.5 text-[13px]" />
        </label>
      )}
      <label className="block">
        <span className="eyebrow">{isVideo ? "Caption" : "Description"}</span>
        <textarea name="caption" defaultValue={defaults.caption} required maxLength={isVideo ? 2200 : 4000} rows={6} className="input mt-1.5 text-[13px]" />
      </label>

      <label className="block">
        <span className="eyebrow">Who can view this {kind}</span>
        <select name="privacy_level" required value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="input mt-1.5 text-[13px]">
          <option value="" disabled>
            Choose who can view
          </option>
          {privacyOptions.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === "SELF_ONLY" && branded}>
              {o.label}
              {o.value === "SELF_ONLY" && branded ? " (not available for branded content)" : ""}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="eyebrow">Allow users to</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-[13px]">
          <Check name="allow_comment" label="Comment" defaultChecked={defaults.comment} disabled={locked.comment} />
          {isVideo && <Check name="allow_duet" label="Duet" defaultChecked={defaults.duet} disabled={locked.duet} />}
          {isVideo && <Check name="allow_stitch" label="Stitch" defaultChecked={defaults.stitch} disabled={locked.stitch} />}
        </div>
        {(locked.comment || (isVideo && (locked.duet || locked.stitch))) && (
          <p className="mt-1 text-xs text-dim">Greyed-out options are turned off in your TikTok privacy settings.</p>
        )}
      </fieldset>

      <fieldset className="rounded-lg border border-line p-4">
        <label className="flex items-start justify-between gap-4 text-[13px]">
          <span>
            <span className="text-fg">Disclose commercial content</span>
            <span className="mt-0.5 block text-xs text-dim">Turn on if this {kind} promotes yourself, a third party, or both.</span>
          </span>
          <input type="checkbox" name="disclose" checked={disclose} onChange={(e) => setDisclose(e.target.checked)} className="mt-1" />
        </label>
        {disclose && (
          <div className="mt-3 space-y-2 text-[13px]">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="brand_organic" checked={organic} onChange={(e) => setOrganic(e.target.checked)} className="mt-1" />
              <span>
                <span className="text-fg">Your brand</span>
                <span className="block text-xs text-dim">You are promoting yourself or your own business.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="brand_content" checked={branded} onChange={(e) => setBranded(e.target.checked)} className="mt-1" />
              <span>
                <span className="text-fg">Branded content</span>
                <span className="block text-xs text-dim">You are promoting another brand or a third party.</span>
              </span>
            </label>
            {discloseIncomplete && <p className="text-xs text-warn">You need to indicate if your content promotes yourself, a third party, or both.</p>}
            {(organic || branded) && (
              <p className="text-xs text-muted">
                Your {kind} will be labeled &ldquo;{branded ? "Paid partnership" : "Promotional content"}&rdquo;. This cannot be changed once your{" "}
                {kind} is posted.
              </p>
            )}
            {brandedPrivate && <p className="text-xs text-bad">Branded content visibility cannot be set to private.</p>}
          </div>
        )}
      </fieldset>

      {isVideo && <Check name="is_aigc" label="Label as AI-generated content" defaultChecked={defaults.aigc} />}

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="post_now" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} />
        <span>Post now instead of at {timeLabel}</span>
      </label>

      <p className="text-xs leading-relaxed text-muted">
        By posting, you agree to TikTok&apos;s{" "}
        {branded && (
          <>
            <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer" className="underline">
              Branded Content Policy
            </a>{" "}
            and{" "}
          </>
        )}
        <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer" className="underline">
          Music Usage Confirmation
        </a>
        .
      </p>

      <div className="flex items-center gap-3">
        {ready ? (
          <SubmitButton className="btn btn-primary" pending="Saving…">
            {postNow ? "Post to TikTok" : `Post to TikTok at ${timeLabel}`}
          </SubmitButton>
        ) : (
          <button type="button" disabled className="btn btn-primary opacity-50">
            {postNow ? "Post to TikTok" : `Post to TikTok at ${timeLabel}`}
          </button>
        )}
        <span className="text-xs text-dim">After it goes out, TikTok can take a few minutes to process it before it shows on your profile.</span>
      </div>
    </form>
  );
}

function Check({ name, label, defaultChecked, disabled }: { name: string; label: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-[13px] ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" name={name} defaultChecked={!disabled && defaultChecked} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}
