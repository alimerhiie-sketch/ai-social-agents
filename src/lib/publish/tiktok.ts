// TikTok Direct Post through Composio, using Ali's own TikTok developer app ("AMX Publisher") added to
// Composio as a custom auth config. TikTok rules that shape this file:
//  - Query creator info before every post and only offer the privacy levels / interactions it allows.
//  - Until TikTok audits the app, every post is private (SELF_ONLY) and the account must be private.
//  - TikTok pulls media from our signed /api/media/ links; that URL prefix is verified in the app.
//  - Each post's settings are chosen by the owner on the TikTok post screen (stored in posts.tiktok_options).

import { pickAny, run, type ComposioConn } from "./composio";
import type { IgMedia } from "./instagram";

export type CreatorInfo = {
  nickname: string;
  username: string;
  avatar: string;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoSeconds: number;
};

export type TikTokOptions = {
  privacy_level: string;
  allow_comment: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  brand_organic: boolean;
  brand_content: boolean;
  is_aigc: boolean;
  title: string;
  caption: string;
  consented_at: string;
};

export const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

const str = (v: unknown) => (v == null ? "" : String(v));

export async function creatorInfo(conn: ComposioConn): Promise<CreatorInfo> {
  const d = await run(conn, "TIKTOK_QUERY_CREATOR_INFO", {});
  const opts = pickAny(d, "privacy_level_options");
  return {
    nickname: str(pickAny(d, "creator_nickname")),
    username: str(pickAny(d, "creator_username")),
    avatar: str(pickAny(d, "creator_avatar_url")),
    privacyOptions: Array.isArray(opts) ? opts.map(String) : [],
    commentDisabled: pickAny(d, "comment_disabled") === true,
    duetDisabled: pickAny(d, "duet_disabled") === true,
    stitchDisabled: pickAny(d, "stitch_disabled") === true,
    maxVideoSeconds: Number(pickAny(d, "max_video_post_duration_sec") ?? 0) || 0,
  };
}

/** Starts the post; returns TikTok's publish_id to check on later ticks. */
export async function startPost(conn: ComposioConn, media: IgMedia, o: TikTokOptions, durationSeconds: number): Promise<string> {
  const info = await creatorInfo(conn);
  if (!info.privacyOptions.includes(o.privacy_level))
    throw new Error(`TikTok no longer allows "${PRIVACY_LABELS[o.privacy_level] ?? o.privacy_level}" for this account. Open the post and choose again.`);
  const brand = { brand_content_toggle: o.brand_content, brand_organic_toggle: o.brand_organic };
  let d: Record<string, unknown>;
  if (media.kind === "reel") {
    if (info.maxVideoSeconds && durationSeconds > info.maxVideoSeconds)
      throw new Error(`The video is ${Math.round(durationSeconds)}s; TikTok allows this account up to ${info.maxVideoSeconds}s.`);
    d = await run(conn, "TIKTOK_PUBLISH_VIDEO", {
      video_url: media.video,
      caption: o.caption.slice(0, 2200),
      privacy_level: o.privacy_level,
      disable_comment: info.commentDisabled || !o.allow_comment,
      disable_duet: info.duetDisabled || !o.allow_duet,
      disable_stitch: info.stitchDisabled || !o.allow_stitch,
      is_aigc: o.is_aigc,
      ...brand,
    });
  } else {
    const images = media.kind === "image" ? [media.image] : media.images;
    d = await run(conn, "TIKTOK_POST_PHOTO", {
      post_mode: "DIRECT_POST",
      photo_images: images.slice(0, 35),
      photo_cover_index: 0,
      title: o.title.slice(0, 90),
      description: o.caption.slice(0, 4000),
      privacy_level: o.privacy_level,
      disable_comment: info.commentDisabled || !o.allow_comment,
      auto_add_music: true,
      ...brand,
    });
  }
  const id = str(pickAny(d, "publish_id"));
  if (!id) throw new Error(`TikTok: no publish_id in the reply (${JSON.stringify(d).slice(0, 200)})`);
  return id;
}

/** done = live on TikTok; pending = still uploading/processing; error = TikTok gave up. */
export async function postStatus(
  conn: ComposioConn,
  publishId: string,
  username: string,
  isVideo: boolean,
): Promise<{ state: "done" | "pending" | "error"; detail: string; mediaId?: string; permalink?: string }> {
  const d = await run(conn, "TIKTOK_FETCH_PUBLISH_STATUS", { publish_id: publishId });
  const status = str(pickAny(d, "status"));
  if (status === "PUBLISH_COMPLETE") {
    const ids = pickAny(d, "publicaly_available_post_id") ?? pickAny(d, "publicly_available_post_id");
    const mediaId = Array.isArray(ids) && ids.length ? String(ids[0]) : "";
    const permalink = mediaId && username ? `https://www.tiktok.com/@${username}/${isVideo ? "video" : "photo"}/${mediaId}` : "";
    return { state: "done", detail: status, mediaId: mediaId || publishId, permalink };
  }
  if (status === "FAILED") return { state: "error", detail: `TikTok could not post it: ${str(pickAny(d, "fail_reason")) || "unknown reason"}` };
  return { state: "pending", detail: status || "processing" };
}
