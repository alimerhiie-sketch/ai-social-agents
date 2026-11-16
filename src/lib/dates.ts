// Calendar dates as YYYY-MM-DD in the PC's local time zone (Beirut), never UTC.

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The next `n` calendar days, starting tomorrow. */
export function nextDays(n: number, from = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i + 1);
    return isoDate(d);
  });
}

const at = (iso: string) => new Date(`${iso}T12:00:00`);
export const weekdayShort = (iso: string) => at(iso).toLocaleDateString("en-GB", { weekday: "short" });
export const prettyDate = (iso: string) =>
  at(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export const longDate = (iso: string) =>
  at(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Current time in ms. Server pages render per request, so reading the clock there is intended. */
export const nowMs = () => Date.now();
