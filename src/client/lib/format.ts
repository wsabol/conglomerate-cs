import { formatEventDate } from "@shared/date";
import type { DatePrecision } from "@shared/types";

interface DateFields {
  eventDate: string | null;
  eventTime: string | null;
  datePrecision: DatePrecision;
}

export function eventDateLabel(e: DateFields): string {
  return formatEventDate(e.eventDate, e.eventTime, e.datePrecision);
}

export function yearOf(dateISO: string | null): string {
  if (!dateISO) return "Unknown";
  const year = dateISO.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "Unknown";
}
