import { z } from "zod";
import {
  BILLING_ROLES,
  CONFIDENCE_LEVELS,
  DATE_PRECISIONS,
  EVENT_TYPES,
  RELATIONSHIP_TYPES,
  SOURCE_TYPES,
} from "../types";

export const eventSourceInputSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES).default("text"),
  description: z.string().trim().max(2000).nullable().optional(),
  url: z.string().trim().url().nullable().optional().or(z.literal("")),
  mediaId: z.number().int().positive().nullable().optional(),
});

export const eventActInputSchema = z.object({
  name: z.string().trim().min(1).max(256),
  billingRole: z.enum(BILLING_ROLES).default("unknown"),
});

export const eventPersonInputSchema = z
  .object({
    personId: z.number().int().positive().optional(),
    displayName: z.string().trim().min(1).max(256).optional(),
    relationshipType: z.enum(RELATIONSHIP_TYPES).default("performer"),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.personId != null || v.displayName, {
    message: "Each person needs an id or display name.",
  });
export type EventPersonInput = z.infer<typeof eventPersonInputSchema>;

export const eventPerformanceInputSchema = z
  .object({
    billingName: z.string().trim().max(512).nullable().optional(),
    promotionText: z.string().trim().max(5000).nullable().optional(),
    setlistText: z.string().trim().max(10000).nullable().optional(),
    eventPosterId: z.number().int().positive().nullable().optional(),
  })
  .optional();

export const eventCreateSchema = z.object({
  name: z.string().trim().min(1).max(512),
  eventType: z.enum(EVENT_TYPES).default("performance"),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  eventTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  datePrecision: z.enum(DATE_PRECISIONS).default("exact"),
  placeId: z.number().int().positive().nullable().optional(),
  summary: z.string().trim().max(20000).nullable().optional(),
  confidence: z.enum(CONFIDENCE_LEVELS).default("medium"),
  heroImageId: z.number().int().positive().nullable().optional(),
  performance: eventPerformanceInputSchema,
  people: z.array(eventPersonInputSchema).default([]),
  acts: z.array(eventActInputSchema).default([]),
  sources: z.array(eventSourceInputSchema).default([]),
});
export type EventCreateInput = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = eventCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;
