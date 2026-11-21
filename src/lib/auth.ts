import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./queue";

// The dashboard is on the public internet, so every page, action and media file needs one of:
//  - the session cookie (you, after logging in with DASHBOARD_PASSWORD)
//  - a signed URL (Instagram fetching one media file)
//  - the runner's bearer secret (internal API)

export const COOKIE = "hq_auth";

const enc = new TextEncoder();

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** The cookie value for a correct password. Changing the password or HQ_SECRET logs everyone out. */
export async function sessionToken(): Promise<string> {
  const e = await env();
  if (!e.HQ_SECRET || !e.DASHBOARD_PASSWORD) throw new Error("HQ_SECRET / DASHBOARD_PASSWORD are not set on the Worker");
  return hmac(e.HQ_SECRET, `dashboard:${e.DASHBOARD_PASSWORD}`);
}

export async function isAuthed(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    return timingSafeEqual(cookieValue, await sessionToken());
  } catch {
    return false;
  }
}

/** For pages and server actions: send strangers to the login page. */
export async function requireAuth() {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!(await isAuthed(c))) redirect("/api/login");
}

/** For the runner's internal endpoints. */
export async function bearerOk(req: Request): Promise<boolean> {
  const e = await env();
  const h = req.headers.get("authorization") ?? "";
  return !!e.HQ_SECRET && timingSafeEqual(h, `Bearer ${e.HQ_SECRET}`);
}

/** Signed, public link to one media file — what Instagram downloads from. */
export async function signedMediaUrl(origin: string, key: string): Promise<string> {
  const e = await env();
  return `${origin}/api/media/${key}?sig=${await hmac(e.HQ_SECRET!, `media:${key}`)}`;
}

export async function mediaSigOk(key: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  const e = await env();
  return !!e.HQ_SECRET && timingSafeEqual(sig, await hmac(e.HQ_SECRET, `media:${key}`));
}
