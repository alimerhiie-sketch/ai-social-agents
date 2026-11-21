import { COOKIE, sessionToken, timingSafeEqual } from "@/lib/auth";
import { env } from "@/lib/queue";

export const dynamic = "force-dynamic";

// A route handler, not a page, so it renders without the dashboard layout (which requires login).

const page = (error = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent HQ</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#09090a;color:#ececef;font:15px/1.5 system-ui,sans-serif}
  form{width:min(340px,calc(100vw - 32px));display:grid;gap:12px}
  h1{font-size:20px;margin:0 0 4px}
  p{margin:0 0 8px;color:#8d8d95;font-size:13px}
  input{padding:11px 12px;border-radius:10px;border:1px solid #2b2b31;background:#101012;color:#ececef;font-size:15px}
  button{padding:11px;border-radius:10px;border:0;background:#cdf36c;color:#0b0d05;font-weight:600;font-size:15px;cursor:pointer}
  .err{color:#f0806f;font-size:13px}
</style></head>
<body><form method="post">
  <h1>Agent HQ</h1><p>Enter the dashboard password. You stay logged in on this device for a year.</p>
  <input type="password" name="password" autocomplete="current-password" autofocus required placeholder="Password">
  ${error ? `<div class="err">${error}</div>` : ""}
  <button>Log in</button>
</form></body></html>`;

export async function GET() {
  return new Response(page(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  const fd = await req.formData();
  const e = await env();
  const ok = !!e.DASHBOARD_PASSWORD && timingSafeEqual(String(fd.get("password") ?? ""), e.DASHBOARD_PASSWORD);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return new Response(page("Wrong password."), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${COOKIE}=${await sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${365 * 86400}`,
    },
  });
}
