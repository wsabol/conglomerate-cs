import { z } from "zod";
import { BILLING_ROLES, EVENT_TYPES, MEDIA_TYPES } from "../types";

export const eventsQuerySchema = z
  .object({
    year: z.coerce.number().int().optional(),
    event_type: z.enum(EVENT_TYPES).optional(),
    exclude_event_type: z.enum(EVENT_TYPES).optional(),
    person: z.coerce.number().int().optional(),
    place: z.coerce.number().int().optional(),
    q: z.string().trim().min(1).optional(),
    lineup: z.enum(BILLING_ROLES).optional(),
    sort: z.enum(["modified", "date"]).default("modified"),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    detailed: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
  })
  .refine((q) => !(q.event_type && q.exclude_event_type), {
    message: "event_type and exclude_event_type cannot be used together",
  });
export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export const mediaQuerySchema = z.object({
  media_type: z.enum(MEDIA_TYPES).optional(),
  year: z.coerce.number().int().optional(),
  person: z.coerce.number().int().optional(),
});
export type MediaQuery = z.infer<typeof mediaQuerySchema>;
