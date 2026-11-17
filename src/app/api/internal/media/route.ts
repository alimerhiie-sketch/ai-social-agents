import { bearerOk } from "@/lib/auth";
import { env } from "@/lib/queue";

export const dynamic = "force-dynamic";

const KEY = /^[a-z0-9][a-z0-9/_.-]{0,200}$/i;

/** The runner uploads finished files here: PUT /api/internal/media?key=content-12/abc/video.mp4 */
export async function PUT(req: Request) {
  if (!(await bearerOk(req))) return new Response("Unauthorized", { status: 401 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!KEY.test(key) || key.includes("..")) return new Response("Bad key", { status: 400 });
  const body = await req.arrayBuffer();
  if (body.byteLength > 24 * 1024 * 1024) return new Response("File over 24 MB (KV limit 25 MB)", { status: 413 });
  await (await env()).MEDIA.put(`media/${key}`, body);
  return Response.json({ ok: true, bytes: body.byteLength });
}

/** Removes every file under a prefix (cleanup after posting). */
export async function DELETE(req: Request) {
  if (!(await bearerOk(req))) return new Response("Unauthorized", { status: 401 });
  const prefix = new URL(req.url).searchParams.get("prefix") ?? "";
  if (!KEY.test(prefix)) return new Response("Bad prefix", { status: 400 });
  const kv = (await env()).MEDIA;
  let n = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: `media/${prefix}`, cursor });
    for (const k of page.keys) await kv.delete(k.name), n++;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return Response.json({ ok: true, deleted: n });
}
