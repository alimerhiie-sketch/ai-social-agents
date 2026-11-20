// JSON Schemas passed to `claude -p --json-schema`. Every object is closed and every
// property required (use "" / [] / 0 for "not applicable") so structured output stays strict.

type S = Record<string, unknown>;
const str = (description?: string): S => ({ type: "string", ...(description && { description }) });
const int = (description?: string): S => ({ type: "integer", ...(description && { description }) });
const num = (description?: string): S => ({ type: "number", ...(description && { description }) });
const strs = (description?: string): S => ({ type: "array", items: { type: "string" }, ...(description && { description }) });
const en = (values: string[], description?: string): S => ({ type: "string", enum: values, ...(description && { description }) });
const list = (items: S, description?: string): S => ({ type: "array", items, ...(description && { description }) });
const obj = (properties: Record<string, S>, description?: string): S => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description && { description }),
});

export const strategySchema = obj({
  positioning: str("One paragraph: who this account is for, what it is known for, and why someone follows it over others."),
  audience: str("The specific target viewer: age, situation, what they want, where they hang out."),
  bio: obj({ instagram: str("Max 150 chars"), tiktok: str("Max 80 chars") }),
  pillars: list(
    obj({
      name: str(),
      description: str(),
      share_percent: int("Share of total posts, all pillars sum to 100"),
      example_ideas: strs("3 concrete post ideas"),
    }),
    "3–5 content pillars",
  ),
  formats: list(
    obj({
      format: en(["reel", "carousel", "post", "story"]),
      platform: en(["instagram", "tiktok", "both"]),
      per_week: int(),
      why: str(),
    }),
  ),
  cadence: obj({
    posts_per_week: int(),
    best_times: strs("Day + local time slots with timezone, e.g. 'Tue 19:00 Beirut'"),
    notes: str(),
  }),
  voice: obj({ do: strs(), dont: strs() }),
  growth_plays: strs("5–8 concrete tactics for growing from zero, specific to this niche"),
  first_30_days: strs("Week-by-week milestones for the first month"),
  kpis: strs("What to measure and the target for month one"),
});

export const trendsSchema = obj({
  scan_notes: str("2–3 sentences: what you searched and the overall mood in this niche right now."),
  trends: list(
    obj({
      title: str("Short name of the trend"),
      what_is_happening: str("What it is and why it is trending, 1–3 sentences"),
      source: str("Where you found it, e.g. 'TikTok Creative Center', 'r/skincareaddiction'"),
      source_url: str("A real URL you saw"),
      momentum: en(["rising", "peaking", "fading", "evergreen", "upcoming"]),
      time_sensitivity: en(["hours", "days", "weeks", "evergreen"]),
      fit_score: int("0–100, honest"),
      fit_reason: str(),
      angle: str("The specific take this account would post, with a draft hook"),
      format: en(["reel", "carousel", "post", "story"]),
      platform: en(["instagram", "tiktok", "both"]),
      risk_notes: str("Brand-safety or copyright risks, or ''"),
    }),
  ),
});

const contentItem = obj({
  title: str("Internal working title"),
  pillar: str("Which strategy pillar this belongs to"),
  platform: en(["instagram", "tiktok", "both"]),
  format: en(["reel", "carousel", "post", "story"]),
  trend_title: str("Exact title of the trend this uses from the list given, or '' for evergreen"),
  video_style: str("One of the account's allowed video style ids, or '' for non-video"),
  duration_seconds: int("Total video length, 0 for non-video"),
  hook: str("The opening line / first frame text"),
  script: list(
    obj({
      beat: str("Label, e.g. 'Hook', 'Point 1', 'Payoff', 'CTA'"),
      seconds: num(),
      visual: str("What we see: stock search terms or the motion-graphic to build"),
      on_screen_text: str(),
      voiceover: str("Exact line, or '' if text-only"),
    }),
    "Video beats. Empty array for carousels/posts.",
  ),
  slides: list(
    obj({ heading: str(), body: str(), visual: str() }),
    "Carousel slides or the single post/story design. Empty array for videos.",
  ),
  art_style: str("One of the account's allowed art style ids, the look for this piece"),
  caption: str("Full caption without hashtags"),
  hashtags: strs("3–5 hashtags without the # sign"),
  cta: str(),
  audio: str("Suggested trending sound or music mood, added in-app"),
  suggested_day: en(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
  rationale: str("Why this should perform, in one or two sentences"),
});

export const planSchema = obj({
  notes: str("One or two sentences on how this batch balances pillars, trends and formats."),
  items: list(contentItem),
});

const beat = obj({
  say: str("The exact words of this scene's voiceover spoken during this beat, in order (3–8 words)"),
  visual: en(["title", "icon", "icons", "split", "counter", "bars", "versus", "flow", "meter", "character", "chat", "checklist", "painting"]),
  text: str("On-screen words for the visual: title text, icon label, split phrase with | between chunks, meter limit label, speech bubble. '' for none"),
  icon: str("Lucide icon name in kebab-case for icon / character prop, e.g. 'scissors', 'coins', 'message-circle'. '' for none"),
  items: list(obj({ icon: str("Lucide icon name or ''"), label: str(), value: str() }), "Rows for icons / bars / versus / flow / chat / checklist; [] otherwise"),
  number: str("counter: the figure, e.g. '100,000', '$20', '75%'. '' otherwise"),
  level: num("meter fill or counter ring, 0–1. 0 otherwise"),
  pose: en(["idle", "wave", "point", "think", "shrug", "cheer", "hold", "surprised"]),
  transition: en(["cut", "whip", "zoom", "wipe", "iris"]),
});

const scene = obj({
  type: en(["motion", "illustration", "hook", "statement", "list", "steps", "stat", "compare", "verdict", "cta"]),
  kicker: str(),
  headline: str(),
  subline: str(),
  items: strs(),
  number: str(),
  numberLabel: str(),
  left: obj({ label: str(), value: str() }),
  right: obj({ label: str(), value: str() }),
  score: int(),
  scoreMax: int(),
  voiceover: str(),
  seconds: num(),
  imagePrompt: str("motion: an optional painted backdrop, an empty place with no people ('' for none). illustration (slides): what the picture shows. No style words, never the character's name"),
  withCharacter: { type: "boolean" },
  camera: en(["push-in", "pull-out", "pan-left", "pan-right", "rise", "drift"]),
  beats: list(beat, "motion scenes: the visual beats over this voice line, one every 1–2.5 s. [] for slides"),
});

export const scenePlanSchema = obj({
  notes: str("One sentence on the visual idea running through the piece"),
  scenes: list(scene),
});
