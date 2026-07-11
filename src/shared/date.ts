import { DateTime } from "luxon";
import type { DatePrecision } from "./types";

// Render locale is pinned so output is deterministic across runtimes
// (workerd, node, browser) and matches the PRD examples exactly.
const LOCALE = "en-US";

/**
 * Format an event date honoring its precision (PRD Sec: Dates & Times).
 *
 * Examples from the PRD:
 *  - 2011-05-14 exact           -> "5/14/2011"
 *  - 2011-05-14 exact + 21:00   -> "5/14/2011, 9:00 PM"
 *  - 2011-05-01 month           -> "May 2011"
 *  - 2011-02-01 semester        -> "Spring 2011"
 *  - 2011-08-01 semester        -> "Fall 2011"
 *  - 2011-01-01 year            -> "2011"
 *  - 2011-05-14 approximate     -> "Around 5/14/2011"
 *  - (unknown)                  -> "Unknown"
 *
 * @param dateISO  ISO date, "yyyy-MM-dd" (or full ISO). May be null/empty.
 * @param time     24h "HH:mm" start time, or null when unknown.
 * @param precision Ambiguity level for the stored date.
 */
export function formatEventDate(
  dateISO: string | null | undefined,
  time: string | null | undefined,
  precision: DatePrecision,
): string {
  if (precision === "unknown" || !dateISO) return "Unknown";

  const normalizedTime = normalizeTime(time);
  const hasTime = normalizedTime !== null;
  const base = dateISO.slice(0, 10);
  const dt = (
    hasTime
      ? DateTime.fromISO(`${base}T${normalizedTime}`)
      : DateTime.fromISO(base)
  ).setLocale(LOCALE);

  if (!dt.isValid) return "Unknown";

  const short = () =>
    hasTime
      ? dt.toLocaleString(DateTime.DATETIME_SHORT)
      : dt.toLocaleString(DateTime.DATE_SHORT);

  switch (precision) {
    case "exact":
      return short();
    case "approximate":
      return `Around ${short()}`;
    case "month":
      return dt.toFormat("LLLL yyyy");
    case "year":
      return dt.toFormat("yyyy");
    case "semester":
      return `${dt.month >= 8 ? "Fall" : "Spring"} ${dt.toFormat("yyyy")}`;
    default:
      return "Unknown";
  }
}

/**
 * Normalize a variety of time inputs to 24h "HH:mm", or null when absent.
 * Accepts "9:00 PM", "21:00", "9 PM", etc. so it is safe both for stored
 * values and for legacy import formats.
 */
export function normalizeTime(
  time: string | null | undefined,
): string | null {
  if (!time) return null;
  const trimmed = time.trim();
  if (!trimmed) return null;

  const formats = ["h:mm a", "h a", "H:mm", "HH:mm", "H", "HH"];
  for (const fmt of formats) {
    const parsed = DateTime.fromFormat(trimmed, fmt, { locale: LOCALE });
    if (parsed.isValid) return parsed.toFormat("HH:mm");
  }
  return null;
}
