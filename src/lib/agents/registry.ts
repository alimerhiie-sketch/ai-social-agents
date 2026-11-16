import type { JobKind } from "../types";

export type AgentDef = {
  id: string;
  name: string;
  role: string;
  phase: 1 | 2 | 3 | 4;
  status: "active" | "basic" | "planned";
  defaultModel: "haiku" | "sonnet" | "opus";
  /** Tools the headless run is allowed to use. Everything else is denied. */
  tools: string[];
};

// The whole team. Only Phase 1 agents run today; the rest show on the dashboard as the roadmap.
export const AGENTS: AgentDef[] = [
  {
    id: "manager",
    name: "Manager",
    role: "Runs each account's cycle, hands out work, holds the approval gate. For now it runs a fixed cycle: strategy (if missing) → trends → weekly plan.",
    phase: 4,
    status: "basic",
    defaultModel: "sonnet",
    tools: [],
  },
  {
    id: "trend-scout",
    name: "Trend Scout",
    role: "Finds what is trending right now and scores each trend for fit against the account.",
    phase: 1,
    status: "active",
    defaultModel: "sonnet",
    tools: ["WebSearch", "WebFetch"],
  },
  {
    id: "strategist",
    name: "Strategist",
    role: "Builds the growth strategy, plans the week and writes production-ready scripts, carousels and captions.",
    phase: 1,
    status: "active",
    defaultModel: "opus",
    tools: ["WebSearch", "WebFetch"],
  },
  {
    id: "designer",
    name: "Designer",
    role: "Turns carousel and post scripts into finished images with Remotion stills and free stock.",
    phase: 2,
    status: "planned",
    defaultModel: "sonnet",
    tools: [],
  },
  {
    id: "video-producer",
    name: "Video Producer",
    role: "Fills Remotion templates from a script, adds local TTS voiceover and captions, renders the MP4.",
    phase: 2,
    status: "planned",
    defaultModel: "sonnet",
    tools: [],
  },
  {
    id: "publisher",
    name: "Publisher",
    role: "Posts to Instagram via the official API and hands TikTok posts to your phone, with AI labels set.",
    phase: 3,
    status: "planned",
    defaultModel: "haiku",
    tools: [],
  },
  {
    id: "analyst",
    name: "Analyst",
    role: "Pulls views, saves, shares and follower growth after posting, and feeds what worked back to the Strategist.",
    phase: 4,
    status: "planned",
    defaultModel: "sonnet",
    tools: [],
  },
];

export const agentById = (id: string) => AGENTS.find((a) => a.id === id);

export const JOB_KINDS: Record<JobKind, { agent: string; label: string; verb: string }> = {
  strategy: { agent: "strategist", label: "Build strategy", verb: "Building strategy" },
  trends: { agent: "trend-scout", label: "Find trends", verb: "Scanning trends" },
  plan: { agent: "strategist", label: "Plan the week", verb: "Planning the week" },
  "from-trend": { agent: "strategist", label: "Content from trend", verb: "Scripting from a trend" },
};
