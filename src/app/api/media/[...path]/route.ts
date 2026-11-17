import { cookies } from "next/headers";
import { bearerOk, COOKIE, isAuthed, mediaSigOk } from "@/lib/auth";
import { env } from "@/lib/queue";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

/**
 * Finished media from Workers KV. Open to you (session cookie) and to Instagram (signed ?sig= link).
 * Supports Range requests so <video> can seek.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const key = (await params).path.map(decodeURIComponent).join("/");
  const url = new URL(req.url);
  const allowed =
    (await mediaSigOk(key, url.searchParams.get("sig"))) || (await isAuthed((await cookies()).get(COOKIE)?.value)) || (await bearerOk(req));
  if (!allowed) return new Response("Not found", { status: 404 });

  const e = await env();
  const buf = await e.MEDIA.get(`media/${key}`, "arrayBuffer");
  if (!buf) return new Response("Not found", { status: 404 });
  const type = TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  if (url.searchParams.has("download")) headers["Content-Disposition"] = `attachment; filename="${key.split("/").slice(-3).join("-")}"`;

  const size = buf.byteLength;
  const m = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    return new Response(buf.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(buf, { headers: { ...headers, "Content-Length": String(size) } });
}
