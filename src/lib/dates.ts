// Calendar dates as YYYY-MM-DD in the owner's time zone. The Worker and the GitHub runner run on UTC,
// so every "today", "tomorrow" and posting time is computed explicitly in this zone.

export const TZ = "Asia/Beirut";

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD of an instant, in the owner's time zone. */
export const isoDate = (d: Date) => ymd.format(d);

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const todayLocal = () => isoDate(new Date());

/** The next `n` calendar days, starting tomorrow. */
export function nextDays(n: number, from = new Date()): string[] {
  const today = isoDate(from);
  return Array.from({ length: n }, (_, i) => addDays(today, i + 1));
}

/** Minutes the zone is ahead of UTC at a given instant (handles daylight saving). */
function offsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(at)
    .reduce<Record<string, string>>((m, p) => ((m[p.type] = p.value), m), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-11-18" + "13:00" in the owner's zone → UTC ISO string. */
export function zonedIso(date: string, time: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const off = offsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000).toISOString();
}

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const weekdayShort = (iso: string) => at(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
export const prettyDate = (iso: string) => at(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const longDate = (iso: string) =>
  at(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Format an instant as local time / date-time in the owner's zone. */
export const localTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const localDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const localDayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

/** Current time in ms. Server pages render per request, so reading the clock there is intended. */
export const nowMs = () => Date.now();
