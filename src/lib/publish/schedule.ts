import { db } from "../db";
import type { Account, ContentItem } from "../types";

// Turns a ready piece into posting slots. Times are local (the laptop's clock, Beirut) and stored as
// UTC ISO strings so the job queue can compare them.

export function parseTimes(list: string): string[] {
  return list
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((t) => t.padStart(5, "0"))
    .sort();
}

const localIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The first free slot for this format on the piece's planned day (or the next day with room). */
export function nextSlot(a: Account, c: ContentItem): string {
  const times = parseTimes(c.format === "reel" ? a.reel_times : a.post_times);
  const slots = times.length ? times : c.format === "reel" ? ["13:00", "20:00"] : ["09:30", "17:30"];
  const now = Date.now() + 10 * 60 * 1000; // at least 10 minutes from now
  let day = c.planned_date && c.planned_date >= todayLocal() ? c.planned_date : todayLocal();
  for (let i = 0; i < 30; i++) {
    for (const t of slots) {
      const iso = localIso(day, t);
      if (new Date(iso).getTime() < now) continue;
      const taken = db
        .prepare(
          `SELECT COUNT(*) n FROM posts p JOIN content c ON c.id = p.content_id
           WHERE p.account_id = ? AND p.scheduled_at = ? AND p.status != 'cancelled'
             AND ((c.format = 'reel') = ?)`,
        )
        .get(a.id, iso, c.format === "reel" ? 1 : 0) as { n: number };
      if (taken.n === 0) return iso;
    }
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + 1);
    day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return new Date(now).toISOString();
}

export function captionFor(a: Account, c: ContentItem) {
  const tags = c.hashtags.map((h) => `#${h}`).join(" ");
  return [c.caption.trim(), a.ai_disclosure.trim(), tags].filter(Boolean).join("\n\n");
}
