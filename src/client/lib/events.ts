import { apiFetch, toQuery } from "./api";
import type { EventDetailDTO, EventListItemDTO, EventSourceDTO } from "@shared/dto";
import {
  eventCreateSchema,
  eventUpdateSchema,
} from "@shared/schemas/event";
import type { BillingRole, EventType, ListResult } from "@shared/types";
import type { z } from "zod";

export type EventCreateBody = z.input<typeof eventCreateSchema>;
export type EventUpdateBody = z.input<typeof eventUpdateSchema>;

export interface ListEventsParams {
  sort?: "date" | "modified";
  limit?: number;
  event_type?: EventType;
  q?: string;
  place?: string | number;
  person?: string | number;
  lineup?: BillingRole;
  year?: string | number;
}

export function listEvents(params: ListEventsParams = {}) {
  return apiFetch<ListResult<EventListItemDTO>>(
    `/api/events${toQuery(
      params as Record<string, string | number | undefined | null>,
    )}`,
  );
}

export function getEvent(slug: string) {
  return apiFetch<EventDetailDTO>(`/api/events/${slug}`);
}

export function createEvent(body: EventCreateBody) {
  return apiFetch<EventDetailDTO>("/api/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchEvent(slug: string, body: EventUpdateBody) {
  return apiFetch<EventDetailDTO>(`/api/events/${slug}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Build a full performance patch body, preserving unset fields from the event. */
export function performancePatch(
  event: EventDetailDTO,
  overrides: {
    setlistText?: string | null;
    eventPosterId?: number | null;
    billingName?: string | null;
    promotionText?: string | null;
  } = {},
) {
  return {
    billingName:
      overrides.billingName !== undefined
        ? overrides.billingName
        : (event.performance?.billingName ?? null),
    promotionText:
      overrides.promotionText !== undefined
        ? overrides.promotionText
        : (event.performance?.promotionText ?? null),
    setlistText:
      overrides.setlistText !== undefined
        ? overrides.setlistText
        : (event.performance?.setlistText ?? null),
    eventPosterId:
      overrides.eventPosterId !== undefined
        ? overrides.eventPosterId
        : (event.performance?.eventPosterId ?? null),
  };
}

/** Map source DTOs to the PATCH input shape (strips server-only fields). */
export function sourcesInput(
  sources: EventSourceDTO[],
): NonNullable<EventUpdateBody["sources"]> {
  return sources.map((s) => ({
    sourceType: s.sourceType,
    description: s.description ?? null,
    url: s.url || null,
    mediaId: s.mediaId ?? null,
  }));
}
