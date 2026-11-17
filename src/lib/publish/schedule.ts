import { sql } from "../db";
import { addDays, todayLocal, zonedIso } from "../dates";
import type { Account, ContentItem } from "../types";

// Turns a ready piece into posting slots. Slot times are the owner's local times (Asia/Beirut),
// stored as UTC ISO strings so the cron can compare them.

export function parseTimes(list: string): string[] {
  return list
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((t) => t.padStart(5, "0"))
    .sort();
}

/** The first free slot for this format on the piece's planned day (or the next day with room). */
export async function nextSlot(a: Account, c: ContentItem): Promise<string> {
  const times = parseTimes(c.format === "reel" ? a.reel_times : a.post_times);
  const slots = times.length ? times : c.format === "reel" ? ["13:00", "20:00"] : ["09:30", "17:30"];
  const earliest = Date.now() + 10 * 60 * 1000; // at least 10 minutes from now
  const today = todayLocal();
  let day = c.planned_date && c.planned_date >= today ? c.planned_date : today;
  for (let i = 0; i < 30; i++) {
    for (const t of slots) {
      const iso = zonedIso(day, t);
      if (new Date(iso).getTime() < earliest) continue;
      const taken = await sql.get<{ n: number }>(
        `SELECT COUNT(*) n FROM posts p JOIN content c ON c.id = p.content_id
         WHERE p.account_id = ? AND p.scheduled_at = ? AND p.status != 'cancelled' AND ((c.format = 'reel') = ?)`,
        a.id,
        iso,
        c.format === "reel" ? 1 : 0,
      );
      if ((taken?.n ?? 0) === 0) return iso;
    }
    day = addDays(day, 1);
  }
  return new Date(earliest).toISOString();
}

export function captionFor(a: Account, c: ContentItem) {
  const tags = c.hashtags.map((h) => `#${h}`).join(" ");
  return [c.caption.trim(), a.ai_disclosure.trim(), tags].filter(Boolean).join("\n\n");
}
