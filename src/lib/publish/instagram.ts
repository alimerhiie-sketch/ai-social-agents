// Instagram API with Instagram Login (graph.instagram.com). Free; works for your own professional
// account while the Meta app is in development mode (no app review needed for accounts with a role
// on the app). Publishing is two steps: create a media container from a public URL, then publish it.

const G = "https://graph.instagram.com/v23.0";

type Json = Record<string, unknown>;

async function call(method: "GET" | "POST", pathname: string, token: string, params: Record<string, string> = {}): Promise<Json> {
  const url = new URL(`${G}/${pathname}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  let res: Response;
  if (method === "GET") {
    for (const [k, v] of body) url.searchParams.set(k, v);
    res = await fetch(url);
  } else {
    res = await fetch(url, { method: "POST", body });
  }
  const j = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || j.error) {
    const e = (j.error ?? {}) as { message?: string; error_user_msg?: string; code?: number };
    throw new Error(`Instagram: ${e.error_user_msg || e.message || res.statusText}${e.code ? ` (code ${e.code})` : ""}`);
  }
  return j;
}

export async function whoAmI(token: string) {
  const j = await call("GET", "me", token, { fields: "user_id,username,account_type" });
  return { userId: String(j.user_id ?? j.id), username: String(j.username ?? ""), accountType: String(j.account_type ?? "") };
}

/** Long-lived tokens last 60 days; refreshing (allowed once they're 24h old) gives another 60. */
export async function refreshToken(token: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message: string } };
  if (!res.ok || !j.access_token) throw new Error(`Instagram token refresh: ${j.error?.message ?? res.statusText}`);
  return { token: j.access_token, expiresAt: new Date(Date.now() + (j.expires_in ?? 60 * 86400) * 1000).toISOString() };
}

async function waitFinished(containerId: string, token: string, log: (s: string) => void) {
  const deadline = Date.now() + 10 * 60 * 1000;
  let last = "";
  while (Date.now() < deadline) {
    const j = await call("GET", containerId, token, { fields: "status_code,status" });
    const code = String(j.status_code ?? "");
    if (code !== last) log(`  container ${containerId}: ${code}`);
    last = code;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") throw new Error(`Instagram could not process the media: ${j.status ?? code}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Instagram took more than 10 minutes to process the media");
}

export type IgMedia = { kind: "reel"; video: string; cover?: string } | { kind: "image"; image: string } | { kind: "carousel"; images: string[] };

/** Publishes and returns the new media id and permalink. URLs must be public HTTPS. */
export async function publish(userId: string, token: string, media: IgMedia, caption: string, log: (s: string) => void) {
  let creationId: string;
  if (media.kind === "reel") {
    log("› Creating the reel container (Instagram downloads and processes the video)…");
    const j = await call("POST", `${userId}/media`, token, {
      media_type: "REELS",
      video_url: media.video,
      caption,
      share_to_feed: "true",
      ...(media.cover ? { cover_url: media.cover } : {}),
    });
    creationId = String(j.id);
    await waitFinished(creationId, token, log);
  } else if (media.kind === "image") {
    log("› Creating the image container…");
    creationId = String((await call("POST", `${userId}/media`, token, { image_url: media.image, caption })).id);
    await waitFinished(creationId, token, log);
  } else {
    const items = media.images.slice(0, 10);
    log(`› Creating ${items.length} carousel items…`);
    const children: string[] = [];
    for (const image of items) {
      const j = await call("POST", `${userId}/media`, token, { image_url: image, is_carousel_item: "true" });
      children.push(String(j.id));
    }
    for (const c of children) await waitFinished(c, token, log);
    creationId = String((await call("POST", `${userId}/media`, token, { media_type: "CAROUSEL", children: children.join(","), caption })).id);
    await waitFinished(creationId, token, log);
  }
  log("› Publishing…");
  const published = await call("POST", `${userId}/media_publish`, token, { creation_id: creationId });
  const mediaId = String(published.id);
  let permalink = "";
  try {
    permalink = String((await call("GET", mediaId, token, { fields: "permalink" })).permalink ?? "");
  } catch {}
  return { mediaId, permalink };
}

// ---------------------------------------------------------------------------
// Two-phase publishing for the cron (it runs every few minutes and shouldn't wait on video
// processing): create the container now, check and publish it on a later tick.

/** Starts processing; returns the container id to check later. Carousel children are short images, so they're awaited here. */
export async function createContainer(userId: string, token: string, media: IgMedia, caption: string): Promise<string> {
  if (media.kind === "reel") {
    const j = await call("POST", `${userId}/media`, token, {
      media_type: "REELS",
      video_url: media.video,
      caption,
      share_to_feed: "true",
      ...(media.cover ? { cover_url: media.cover } : {}),
    });
    return String(j.id);
  }
  if (media.kind === "image") return String((await call("POST", `${userId}/media`, token, { image_url: media.image, caption })).id);
  const children: string[] = [];
  for (const image of media.images.slice(0, 10)) {
    children.push(String((await call("POST", `${userId}/media`, token, { image_url: image, is_carousel_item: "true" })).id));
  }
  for (const c of children) await waitFinished(c, token, () => {});
  return String((await call("POST", `${userId}/media`, token, { media_type: "CAROUSEL", children: children.join(","), caption })).id);
}

/** FINISHED, IN_PROGRESS, ERROR, EXPIRED or PUBLISHED. */
export async function containerStatus(containerId: string, token: string): Promise<{ code: string; detail: string }> {
  const j = await call("GET", containerId, token, { fields: "status_code,status" });
  return { code: String(j.status_code ?? ""), detail: String(j.status ?? "") };
}

export async function publishContainer(userId: string, token: string, containerId: string) {
  const published = await call("POST", `${userId}/media_publish`, token, { creation_id: containerId });
  const mediaId = String(published.id);
  let permalink = "";
  try {
    permalink = String((await call("GET", mediaId, token, { fields: "permalink" })).permalink ?? "");
  } catch {}
  return { mediaId, permalink };
}
