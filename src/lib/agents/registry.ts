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

// The whole team. "planned" agents show on the dashboard as the roadmap.
export const AGENTS: AgentDef[] = [
  {
    id: "manager",
    name: "Manager",
    role: "Runs each account's cycle and steers it. Every Sunday night, after the Analyst's report, it writes you a brief (where the account stands, what the team changes next week, what needs your decision) and sets next week's mix of feed formats and art styles within what you enabled. It never changes posting volume.",
    phase: 4,
    status: "active",
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
    role: "Turns carousel and post scripts into slide plans: an illustrated cover in the account's art style, then readable type slides.",
    phase: 2,
    status: "active",
    defaultModel: "sonnet",
    tools: [],
  },
  {
    id: "video-producer",
    name: "Video Producer",
    role: "Turns a script into an illustrated scene plan: image prompts, camera moves, voice lines. The renderer paints, voices and animates it.",
    phase: 2,
    status: "active",
    defaultModel: "sonnet",
    tools: [],
  },
  {
    id: "agent-developer",
    name: "Agent Developer",
    role: "Trains the team. Once a week it researches skills and techniques for each agent, studies their output against your feedback and the post results, and proposes exact instruction upgrades. Nothing changes until you approve it on the Upgrades page.",
    phase: 4,
    status: "active",
    defaultModel: "opus",
    tools: ["WebSearch", "WebFetch"],
  },
  {
    id: "publisher",
    name: "Publisher",
    role: "Posts to Instagram on schedule through the official API, and queues TikTok posts on your phone page with the caption ready to copy.",
    phase: 3,
    status: "basic",
    defaultModel: "haiku",
    tools: [],
  },
  {
    id: "analyst",
    name: "Analyst",
    role: "Reads each Instagram post's views, reach, saves, shares and watch time at 1h, 24h, 72h and 7 days, and the follower count daily. Every Sunday it reports what worked, the best and worst pieces and why, and gives the Strategist concrete recommendations for the next scripts.",
    phase: 4,
    status: "active",
    defaultModel: "sonnet",
    tools: [],
  },
];

export const agentById = (id: string) => AGENTS.find((a) => a.id === id);

export const JOB_KINDS: Record<JobKind, { agent: string; label: string; verb: string }> = {
  strategy: { agent: "strategist", label: "Build strategy", verb: "Building strategy" },
  trends: { agent: "trend-scout", label: "Find trends", verb: "Scanning trends" },
  plan: { agent: "strategist", label: "Script a day", verb: "Scripting a day" },
  "from-trend": { agent: "strategist", label: "Content from trend", verb: "Scripting from a trend" },
  video: { agent: "video-producer", label: "Plan the video", verb: "Planning the video" },
  design: { agent: "designer", label: "Plan the slides", verb: "Planning the slides" },
  render: { agent: "renderer", label: "Render", verb: "Painting and rendering" },
  publish: { agent: "publisher", label: "Post to Instagram", verb: "Posting to Instagram" },
  develop: { agent: "agent-developer", label: "Upgrade the agents", verb: "Researching agent upgrades" },
  analyze: { agent: "analyst", label: "Weekly analysis", verb: "Analysing the week's results" },
  brief: { agent: "manager", label: "Weekly brief", verb: "Writing the weekly brief" },
};
