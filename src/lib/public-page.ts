// Small public pages (no login): the landing page, Terms and Privacy that TikTok's developer app
// form links to. Served from route handlers so they skip the dashboard's login-gated layout.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const APP_NAME = "AMX Publisher";
export const OPERATOR = "AMX (operator of @amx_ai1)";
export const UPDATED = "20 November 2026";

export function publicPage(title: string, bodyHtml: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${APP_NAME}</title>
<style>
  :root { --bg:#0b0c0e; --fg:#ececee; --muted:#a3a5ab; --line:#25272c; --accent:#93a6ff; }
  @media (prefers-color-scheme: light) { :root { --bg:#fbfbfa; --fg:#141518; --muted:#55585f; --line:#e3e3e0; --accent:#1330e0; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 56px 20px 80px; }
  nav { display:flex; gap:18px; font-size:14px; margin-bottom:48px; }
  nav a { color:var(--muted); text-decoration:none; } nav a:hover { color:var(--fg); }
  nav strong { color:var(--fg); margin-right:auto; }
  h1 { font-size: 30px; line-height:1.2; margin:0 0 6px; letter-spacing:-0.01em; }
  h2 { font-size: 18px; margin: 36px 0 8px; }
  p, li { color: var(--muted); } strong { color: var(--fg); }
  a { color: var(--accent); }
  .meta { font-size: 13px; color: var(--muted); margin-bottom: 32px; }
  footer { margin-top:64px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }
</style>
</head>
<body><main>
<nav><strong>${APP_NAME}</strong><a href="/about">About</a><a href="/legal/terms">Terms</a><a href="/legal/privacy">Privacy</a></nav>
${bodyHtml}
<footer>${APP_NAME} is operated by ${esc(OPERATOR)}. Contact: Instagram <a href="https://www.instagram.com/amx_ai1/">@amx_ai1</a>.</footer>
</main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600" } });
}
