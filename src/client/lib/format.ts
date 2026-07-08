import { DateTime } from "luxon";
import { formatEventDate, normalizeTime } from "@shared/date";
import type { EventActDTO, EventPersonDTO } from "@shared/dto";
import type {
  Confidence,
  DatePrecision,
  EventType,
  RelationshipType,
} from "@shared/types";

interface DateFields {
  eventDate: string | null;
  eventTime: string | null;
  datePrecision: DatePrecision;
}

export function eventDateLabel(e: DateFields): string {
  return formatEventDate(e.eventDate, e.eventTime, e.datePrecision);
}

/** Date portion only — omits time even when one is stored. */
export function eventDateOnlyLabel(e: DateFields): string {
  return formatEventDate(e.eventDate, null, e.datePrecision);
}

export function eventTimeLabel(time: string | null): string | null {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const dt = DateTime.fromISO(`2000-01-01T${normalized}`).setLocale("en-US");
  return dt.isValid ? dt.toLocaleString(DateTime.TIME_SIMPLE) : null;
}

/** Date and time for event metadata, separated by a middot when time is known. */
export function eventDateTimeMetaLabel(e: DateFields): string {
  const date = eventDateOnlyLabel(e);
  if (e.datePrecision === "exact") {
    const time = eventTimeLabel(e.eventTime);
    if (time) return `${date} · ${time}`;
  }
  return date;
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function confidenceLabel(confidence: Confidence): string {
  return CONFIDENCE_LABELS[confidence];
}

export function eventTypeLabel(type: EventType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function yearOf(dateISO: string | null): string {
  if (!dateISO) return "Unknown";
  const year = dateISO.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "Unknown";
}

/** Headliner last; within each group, sort alphabetically by name. */
export function sortActsForDisplay(acts: EventActDTO[]): EventActDTO[] {
  return [...acts].sort((a, b) => {
    const aHead = a.billingRole === "headliner" ? 1 : 0;
    const bHead = b.billingRole === "headliner" ? 1 : 0;
    return aHead - bHead || a.name.localeCompare(b.name);
  });
}

const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  performer: "Performer",
  attendee: "Attendee",
  organizer: "Organizer",
  photographer: "Photographer",
  unknown: "Unknown",
};

export function relationshipTypeLabel(type: RelationshipType): string {
  return RELATIONSHIP_TYPE_LABELS[type];
}

const RELATIONSHIP_TYPE_ORDER: Record<RelationshipType, number> = {
  performer: 0,
  organizer: 1,
  photographer: 2,
  attendee: 3,
  unknown: 4,
};

/** Performers first; within each role group, sort alphabetically by name. */
export function sortPeopleForDisplay(
  people: EventPersonDTO[],
): EventPersonDTO[] {
  return [...people].sort((a, b) => {
    const roleDiff =
      RELATIONSHIP_TYPE_ORDER[a.relationshipType] -
      RELATIONSHIP_TYPE_ORDER[b.relationshipType];
    return roleDiff || a.displayName.localeCompare(b.displayName);
  });
}
