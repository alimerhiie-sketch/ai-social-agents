import type { ContentStatus } from "./options";

export type Strategy = {
  positioning: string;
  audience: string;
  bio: { instagram: string; tiktok: string };
  pillars: { name: string; description: string; share_percent: number; example_ideas: string[] }[];
  formats: { format: string; platform: string; per_week: number; why: string }[];
  cadence: { posts_per_week: number; best_times: string[]; notes: string };
  voice: { do: string[]; dont: string[] };
  growth_plays: string[];
  first_30_days: string[];
  kpis: string[];
};

export type Account = {
  id: number;
  name: string;
  niche: string;
  description: string;
  audience: string;
  language: string;
  platforms: string[];
  ig_handle: string;
  tiktok_handle: string;
  tones: string[];
  formats: string[];
  video_styles: string[];
  posts_per_week: number;
  reels_per_day: number;
  posts_per_day: number;
  art_styles: string[];
  character: string;
  approval_mode: "manual" | "auto";
  brand_colors: string[];
  avoid: string;
  inspiration: string;
  strategy: Strategy | null;
  strategy_updated_at: string | null;
  created_at: string;
};

export type Trend = {
  id: number;
  account_id: number;
  job_id: number | null;
  title: string;
  summary: string;
  source: string;
  source_url: string;
  momentum: string;
  time_sensitivity: string;
  fit_score: number;
  fit_reason: string;
  angle: string;
  format: string;
  platform: string;
  risk_notes: string;
  status: "new" | "used" | "dismissed";
  created_at: string;
};

export type ScriptBeat = { beat: string; seconds: number; visual: string; on_screen_text: string; voiceover: string };
export type Slide = { heading: string; body: string; visual: string };

export type ContentItem = {
  id: number;
  account_id: number;
  trend_id: number | null;
  job_id: number | null;
  title: string;
  pillar: string;
  platform: string;
  format: string;
  video_style: string;
  duration_seconds: number;
  hook: string;
  script: ScriptBeat[];
  slides: Slide[];
  caption: string;
  hashtags: string[];
  cta: string;
  audio: string;
  suggested_day: string;
  planned_date: string | null;
  art_style: string;
  /** scene plan from the Video Producer / Designer */
  production: { scenes: Record<string, unknown>[]; notes?: string } | null;
  /** rendered files, relative to the item's media folder */
  media: { kind: "reel" | "slides"; files: string[]; cover: string; durationSeconds: number; dir: string } | null;
  rationale: string;
  status: ContentStatus;
  feedback: string;
  created_at: string;
  updated_at: string;
};

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type JobKind = "strategy" | "trends" | "plan" | "from-trend" | "video" | "design" | "render";

export type Job = {
  id: number;
  kind: JobKind;
  agent: string;
  account_id: number | null;
  ref_id: number | null;
  depends_on: number | null;
  target_date: string | null;
  not_before?: string | null;
  status: JobStatus;
  model: string | null;
  summary: string | null;
  error: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
