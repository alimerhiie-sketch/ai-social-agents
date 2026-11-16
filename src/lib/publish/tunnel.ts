import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// Instagram's API won't take uploads: it downloads each image/video from a public HTTPS URL.
// We expose ONLY the rendered media, under a random secret path, through a Cloudflare quick tunnel
// (free, no account). The dashboard itself is never exposed. The tunnel closes after a quiet period.

const IDLE_MS = 15 * 60 * 1000;

type State = { server: http.Server; port: number; secret: string; child: ChildProcess; url: string; lastUse: number; timer: NodeJS.Timeout } | null;
const g = globalThis as unknown as { __hqTunnel?: State; __hqTunnelStarting?: Promise<NonNullable<State>> };

export function cloudflaredBin() {
  return process.env.CLOUDFLARED_BIN || path.join(process.env.USERPROFILE || "", "tools", "cloudflared.exe");
}

function startMediaServer(root: string, secret: string): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (parts[0] !== secret || parts.some((p) => p === ".." || p.includes("\\"))) {
        res.writeHead(404).end();
        return;
      }
      const file = path.resolve(root, ...parts.slice(1));
      if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const type = ext === ".mp4" ? "video/mp4" : ext === ".png" ? "image/png" : "image/jpeg";
      res.writeHead(200, { "Content-Type": type, "Content-Length": fs.statSync(file).size });
      fs.createReadStream(file).pipe(res);
      if (g.__hqTunnel) g.__hqTunnel.lastUse = Date.now();
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

function startTunnel(port: number): Promise<{ child: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const bin = cloudflaredBin();
    if (!fs.existsSync(bin)) return reject(new Error(`cloudflared not found at ${bin}`));
    const child = spawn(bin, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], { windowsHide: true });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Cloudflare quick tunnel did not come up within 60s"));
    }, 60_000);
    const onData = (d: Buffer) => {
      out += d.toString("utf8");
      const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolve({ child, url: m[0] });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", () => {
      if (g.__hqTunnel?.child === child) g.__hqTunnel = null;
    });
  });
}

function closeTunnel() {
  const t = g.__hqTunnel;
  if (!t) return;
  g.__hqTunnel = null;
  clearInterval(t.timer);
  t.child.kill();
  t.server.close();
}

/** Public HTTPS base URL for files under `root` (the media folder). Starts the tunnel if needed. */
export async function publicMediaBase(root: string): Promise<string> {
  if (g.__hqTunnel && g.__hqTunnel.child.exitCode === null) {
    g.__hqTunnel.lastUse = Date.now();
    return `${g.__hqTunnel.url}/${g.__hqTunnel.secret}`;
  }
  g.__hqTunnelStarting ??= (async () => {
    const secret = crypto.randomBytes(18).toString("hex");
    const { server, port } = await startMediaServer(root, secret);
    try {
      const { child, url } = await startTunnel(port);
      // DNS for a fresh trycloudflare.com host takes a few seconds to resolve worldwide.
      await waitReachable(`${url}/${secret}/__probe__`);
      const timer = setInterval(() => {
        if (g.__hqTunnel && Date.now() - g.__hqTunnel.lastUse > IDLE_MS) closeTunnel();
      }, 60_000);
      return (g.__hqTunnel = { server, port, secret, child, url, lastUse: Date.now(), timer });
    } catch (e) {
      server.close();
      throw e;
    }
  })().finally(() => (g.__hqTunnelStarting = undefined));
  const t = await g.__hqTunnelStarting;
  return `${t.url}/${t.secret}`;
}

async function waitReachable(url: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.status === 404) return; // our server answered (the probe file doesn't exist)
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
}
