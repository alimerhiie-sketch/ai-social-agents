# Agent HQ

Control room for the AI agents that grow your Instagram and TikTok accounts. Runs on your PC and your Claude
subscription. Costs nothing extra.

## Run it

```bash
npm run dev -- -p 3210
```

Open http://localhost:3210

## One-time: sign the agents in

The agents run through the Claude Code CLI on your subscription. Its sign-in had expired, so:

```bash
claude setup-token
```

Copy the token it prints into a new file `.env.local` in this folder:

```
CLAUDE_CODE_OAUTH_TOKEN=paste-the-token-here
```

Restart the dashboard. The red "Agents can't run yet" banner disappears once it works.
(`claude auth login` also works, but that login expires; the setup token lasts about a year.)

## Using it

1. **Accounts → New account**: niche, audience, language, platforms, and the content types the account may make
   (formats, video styles, tone, posts per week).
2. On the account page: **Build strategy** → **Find trends** → **Plan the week**, or **Run weekly cycle** for all three.
3. **Pipeline**: open each script, approve it, or reject it with a reason. The Strategist reads your reasons next time.
4. **Agents**: watch runs live and pick each agent's model. Heavier models use more of your plan's usage limit.

## Where things live

- Agents: `.claude/agents/trend-scout.md`, `.claude/agents/strategist.md` (edit these to change how they think)
- Job queue / CLI bridge: `src/lib/agents/runner.ts`
- Data + run logs: `%LOCALAPPDATA%\ai-social-agents\` (kept out of OneDrive on purpose)
