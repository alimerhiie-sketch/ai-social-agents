import { q, sql } from "../db";
import type { Account, Job } from "../types";
import { longDate, TZ, weekdayShort } from "../dates";
import { ART_STYLES } from "../options";
import { developerPrompt } from "./developer";
import { upgradesBlock } from "./upgrades";
import { analysisPrompt, briefPrompt, dayMix, resultsBlock } from "../analytics/review";

// Builds the task prompt for each job kind. Built when the job STARTS, not when it is
// queued, so a "plan" job that follows a "trends" job sees the trends that were just found.

const today = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });

function profile(a: Account) {
  return JSON.stringify(
    {
      name: a.name,
      niche: a.niche,
      description: a.description,
      target_audience: a.audience,
      language: a.language,
      platforms: a.platforms,
      handles: { instagram: a.ig_handle || "(not created yet)", tiktok: a.tiktok_handle || "(not created yet)" },
      tones: a.tones,
      allowed_formats: a.formats,
      allowed_video_styles: a.video_styles,
      allowed_art_styles: a.art_styles.length ? a.art_styles : ["ghibli"],
      recurring_character: a.character || "(none — invent scenes without a mascot)",
      daily_output: `${a.reels_per_day} short video(s) + ${a.posts_per_day} feed post(s) every day`,
      brand_colors: a.brand_colors,
      topics_to_avoid: a.avoid || "(none given)",
      inspiration_accounts: a.inspiration || "(none given)",
    },
    null,
    2,
  );
}

async function feedback(accountId: number) {
  const approved = await sql.all<{ title: string; format: string; hook: string }>(
    "SELECT title, format, hook FROM content WHERE account_id = ? AND status IN ('approved','producing','review','ready','scheduled','posted') ORDER BY id DESC LIMIT 10",
    accountId,
  );
  const rejected = await sql.all<{ title: string; format: string; hook: string; feedback: string }>(
    "SELECT title, format, hook, feedback FROM content WHERE account_id = ? AND status = 'rejected' ORDER BY id DESC LIMIT 10",
    accountId,
  );
  if (!approved.length && !rejected.length) return "OWNER FEEDBACK\n(none yet — this is the first batch)";
  return [
    "OWNER FEEDBACK",
    "Approved (do more like these):",
    ...(approved.length ? approved.map((c) => `- [${c.format}] ${c.title} — hook: "${c.hook}"`) : ["- (none yet)"]),
    "Rejected (avoid, and respect the reason):",
    ...(rejected.length
      ? rejected.map((c) => `- [${c.format}] ${c.title} — hook: "${c.hook}" — reason: ${c.feedback || "(no reason given)"}`)
      : ["- (none yet)"]),
  ].join("\n");
}

async function recentContent(accountId: number) {
  const rows = await sql.all<{ title: string }>("SELECT title FROM content WHERE account_id = ? ORDER BY id DESC LIMIT 40", accountId);
  return rows.length ? rows.map((r) => `- ${r.title}`).join("\n") : "(none yet)";
}

function strategyBlock(a: Account) {
  return a.strategy
    ? `STRATEGY (follow it)\n${JSON.stringify(a.strategy, null, 2)}`
    : "STRATEGY\n(no strategy yet — infer sensible pillars from the profile)";
}

/** The task prompt, plus any upgrades the owner approved for this agent (see upgrades.ts). */
export async function buildPrompt(job: Job): Promise<string> {
  const base = await basePrompt(job);
  return base ? base + (await upgradesBlock(job)) : base;
}

async function basePrompt(job: Job): Promise<string> {
  const a = job.account_id ? await q.account(job.account_id) : null;
  if (!a) throw new Error("Account not found for this job");
  const fb = await feedback(a.id);
  const recent = await recentContent(a.id);
  // Real post results from the Analyst (empty until the first weekly report).
  const results = job.kind === "strategy" || job.kind === "plan" || job.kind === "from-trend" ? await resultsBlock(a.id) : "";

  switch (job.kind) {
    case "strategy":
      return [
        `Today is ${today()}.`,
        `Build the growth strategy for this account. It is brand new: 0 followers, 0 posts. The owner sets it up by hand on ${a.platforms.join(" and ")}.`,
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        a.strategy ? `CURRENT STRATEGY (revise it; keep what still makes sense)\n${JSON.stringify(a.strategy, null, 2)}` : "",
        fb,
        "",
        results,
        "",
        "Research briefly (3–5 searches) to see what is winning in this niche, then return the strategy as structured output.",
        `The owner has fixed the daily output: ${a.reels_per_day} short video(s) and ${a.posts_per_day} feed post(s) (carousel or single image) EVERY day = ${7 * (a.reels_per_day + a.posts_per_day)} pieces a week. Build the format mix, cadence and best posting times around exactly that. Only use formats from allowed_formats.`,
      ].join("\n");

    case "trends": {
      const seen = await sql.all<{ title: string }>(
        "SELECT title FROM trends WHERE account_id = ? AND created_at > datetime('now','-21 days') ORDER BY id DESC LIMIT 60",
        a.id,
      );
      return [
        `Today is ${today()}.`,
        "Scan for what is trending RIGHT NOW that this account could turn into content.",
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        a.strategy ? `CONTENT PILLARS\n${a.strategy.pillars.map((p) => `- ${p.name}: ${p.description}`).join("\n")}` : "",
        "",
        "ALREADY FOUND (do not repeat these)",
        seen.length ? seen.map((s) => `- ${s.title}`).join("\n") : "(nothing yet)",
        "",
        "Return 8–12 trends, best fit first, as structured output.",
      ].join("\n");
    }

    case "plan": {
      const date = job.target_date;
      if (!date) throw new Error("Day plan job has no target date");
      const reels = a.formats.includes("reel") ? a.reels_per_day : 0;
      const feedFormats = a.formats.filter((f) => f === "carousel" || f === "post");
      const posts = feedFormats.length ? a.posts_per_day : 0;
      const n = reels + posts;
      if (n === 0) throw new Error("This account's daily mix is 0 reels and 0 posts");
      // The Manager's weekly mix (from results): which feed formats today, and an art style per piece.
      const mix = await dayMix(a, date);
      const feedToday = mix?.feed.length === posts ? mix.feed : [];
      const countOf = (xs: string[]) => [...new Set(xs)].map((f) => `${xs.filter((x) => x === f).length} "${f}"`).join(" + ");
      const sameWeek = await sql.all<{ planned_date: string; format: string; title: string; pillar: string }>(
        "SELECT planned_date, format, title, pillar FROM content WHERE account_id = ? AND planned_date BETWEEN date(?, '-6 days') AND date(?, '+6 days') AND status != 'rejected' ORDER BY planned_date",
        a.id,
        date,
        date,
      );
      const trends = await sql.all<Record<string, string | number>>(
        "SELECT title, summary, angle, format, fit_score, momentum, time_sensitivity FROM trends WHERE account_id = ? AND status = 'new' AND created_at > datetime('now','-7 days') ORDER BY fit_score DESC LIMIT 12",
        a.id,
      );
      return [
        `Today is ${today()}. You are scripting the posts for ${longDate(date)}.`,
        "",
        "THE DAY'S MIX (exact — return exactly these, no more, no less)",
        `- ${reels} short video${reels === 1 ? "" : "s"}: format "reel"`,
        feedToday.length
          ? `- ${posts} feed post${posts === 1 ? "" : "s"}: ${countOf(feedToday)} (set by the Manager's weekly mix, from the results)`
          : `- ${posts} feed post${posts === 1 ? "" : "s"}: format ${feedFormats.map((f) => `"${f}"`).join(" or ")}${feedFormats.length > 1 ? " (mix them; carousels for teaching, single posts for one bold idea)" : ""}`,
        mix?.styles.length
          ? `- Art styles for today's ${n} pieces (the Manager's weekly mix; one each, any order): ${mix.styles.map((s) => `"${s}"`).join(", ")}`
          : "",
        "Make the pieces of one day different from each other: different pillars, different hook styles. Space time-sensitive trends to the earliest days.",
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        strategyBlock(a),
        "",
        "FRESH TRENDS (use the strongest where they fit; set trend_title to the exact title; a trend used on another day is already marked used and won't appear here)",
        trends.length
          ? trends.map((t) => `- ${t.title} [fit ${t.fit_score}, ${t.momentum}, ${t.time_sensitivity}, ${t.format}] — ${t.summary} Angle: ${t.angle}`).join("\n")
          : "(no fresh trends — make it evergreen pillar content)",
        "",
        "ALREADY PLANNED AROUND THIS DATE (balance pillars against these; never repeat them)",
        sameWeek.length ? sameWeek.map((c) => `- ${c.planned_date} [${c.format}] ${c.title} (${c.pillar})`).join("\n") : "(nothing yet — this is the first day planned)",
        "",
        "OLDER CONTENT (do not repeat)",
        recent,
        "",
        fb,
        "",
        results,
        "",
        `Return exactly ${n} items as structured output. Only use allowed_formats and allowed_video_styles. Set suggested_day to ${weekdayShort(date)}.`,
      ].join("\n");
    }

    case "video":
    case "design": {
      const c = job.ref_id ? await q.contentItem(job.ref_id) : null;
      if (!c) throw new Error("Content item not found for this job");
      const style = ART_STYLES.find((s) => s.id === (c.art_style || a.art_styles[0])) ?? ART_STYLES[0];
      const piece = {
        title: c.title,
        format: c.format,
        platform: c.platform,
        hook: c.hook,
        ...(job.kind === "video" ? { script_beats: c.script, target_length_seconds: c.duration_seconds } : { slides: c.slides }),
        caption: c.caption,
        cta: c.cta,
        owner_notes: c.feedback || "",
      };
      return [
        job.kind === "video"
          ? "Turn this approved short-video script into a motion-graphics beat plan (scenes = voice lines, beats = a new animated visual every 1–2.5 s)."
          : `Turn this approved ${c.format === "carousel" ? "carousel" : "single post"} into a slide plan.`,
        "",
        `ART STYLE (the image model adds it to painted backdrops; don't repeat style words in imagePrompt): ${style.label}`,
        job.kind === "video"
          ? `RECURRING CHARACTER: ${a.character ? "yes — it is drawn and animated in code; use 'character' beats with a pose. Never put it (or any people) in imagePrompt." : "none — skip 'character' beats"}`
          : `RECURRING CHARACTER: ${a.character ? "yes — set withCharacter true where the character appears, and never name or describe it in imagePrompt (the pipeline inserts its description)" : "none — set withCharacter false everywhere"}`,
        `ACCOUNT LANGUAGE: ${a.language}`,
        ...(job.kind === "design" ? ["POSTER LOOK: slides render as bold flat posters drawn in code (no painted images; ignore the art style, leave imagePrompt empty)."] : []),
        "",
        "THE PIECE",
        JSON.stringify(piece, null, 2),
        "",
        "Return the scene plan as structured output.",
      ].join("\n");
    }

    case "render":
    case "publish":
      return "";

    case "develop":
      return developerPrompt(job, a);

    case "analyze":
      return analysisPrompt(job, a);

    case "brief":
      return briefPrompt(job, a);

    case "from-trend": {
      const t = job.ref_id ? await q.trend(job.ref_id) : null;
      if (!t) throw new Error("Trend not found for this job");
      return [
        `Today is ${today()}.`,
        "Turn this one trend into a single, fully scripted piece of content for the account.",
        "",
        "TREND",
        JSON.stringify({ title: t.title, what_is_happening: t.summary, source: t.source_url, momentum: t.momentum, suggested_angle: t.angle, suggested_format: t.format, risk_notes: t.risk_notes }, null, 2),
        "",
        "ACCOUNT PROFILE",
        profile(a),
        "",
        strategyBlock(a),
        "",
        "RECENT CONTENT (do not repeat)",
        recent,
        "",
        fb,
        "",
        results,
        "",
        `Return exactly 1 item as structured output, with trend_title set to "${t.title}". You may improve on the suggested angle. If the suggested format is not in allowed_formats, pick the best allowed one.`,
      ].join("\n");
    }
  }
}
