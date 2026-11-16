import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Agents run through the Claude Code CLI on your Claude subscription — no API key.
// The npm package's bin/claude.exe is the real native binary once its postinstall has run.

export function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const npmExe = path.join(process.env.APPDATA || "", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  if (process.platform === "win32" && fs.existsSync(npmExe)) return npmExe;
  return "claude";
}

export type CliStatus = { ok: boolean; loggedIn: boolean; version: string | null; detail: string };

const g = globalThis as unknown as { __hqCli?: { at: number; status: CliStatus } };

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(claudeBin(), args, { timeout: 20_000, windowsHide: true }, (err, stdout, stderr) => {
      if (err && !stdout) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

export async function cliStatus(force = false): Promise<CliStatus> {
  if (!force && g.__hqCli && Date.now() - g.__hqCli.at < 30_000) return g.__hqCli.status;
  let status: CliStatus;
  try {
    const version = (await run(["--version"])).trim().split(" ")[0] || null;
    // A long-lived token from `claude setup-token` (in .env.local) also counts as signed in.
    const tokenAuth = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    let loggedIn = tokenAuth;
    let detail = tokenAuth ? "Signed in with a long-lived token (CLAUDE_CODE_OAUTH_TOKEN)" : "";
    if (!tokenAuth) {
      try {
        const s = JSON.parse(await run(["auth", "status"]));
        loggedIn = !!s.loggedIn;
        detail = loggedIn ? `Signed in (${s.authMethod ?? "subscription"})` : "Claude Code is not signed in";
      } catch {
        detail = "Could not read sign-in status";
      }
    }
    status = { ok: loggedIn, loggedIn, version, detail };
  } catch (e) {
    status = { ok: false, loggedIn: false, version: null, detail: `Claude Code CLI not runnable: ${(e as Error).message}` };
  }
  g.__hqCli = { at: Date.now(), status };
  return status;
}
