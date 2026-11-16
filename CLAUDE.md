@AGENTS.md

# Agent HQ

Local control room for a team of AI agents that grow brand-new Instagram and TikTok accounts.

**Hard constraint: zero extra spend.** Everything runs on the owner's Claude subscription and free tools.
No Anthropic API key, no paid image/video generation, no paid posting services, no servers.

## How it works

- Next.js 16 dashboard (`src/app`), SQLite via Node's built-in `node:sqlite` (`src/lib/db.ts`).
  Data and job logs live in `%LOCALAPPDATA%\ai-social-agents\`, outside OneDrive.
- Agents are Claude Code agent files in `.claude/agents/`. The job queue (`src/lib/agents/runner.ts`) runs each
  job as a headless `claude -p --agent <name> --json-schema <schema>` process, one at a time, then writes the
  structured output into the database (`apply.ts`). Prompts are built at job start (`prompts.ts`).
- Content moves through statuses: scripted → approved → producing → review → scheduled → posted (or rejected).
  Rejection reasons are fed back to the Strategist.

## Phases

1. ✅ Dashboard, account profiles, Trend Scout, Strategist.
2. Remotion template library + Designer + Video Producer (local TTS: Kokoro/Piper, local Whisper captions, Pexels/Pixabay stock).
3. Publisher: Instagram Graph API (free); TikTok = prepared video + caption sent to the owner's phone.
4. Analyst + Manager running cycles on a schedule.

## When you are run as an agent

Follow your agent file, return only the structured output, and do not edit files in this project.
