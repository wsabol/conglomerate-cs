import { z } from "zod";
import { PLACE_STATUSES } from "../types";

export const placeCreateSchema = z.object({
  name: z.string().trim().min(1).max(512),
  placeType: z.string().trim().max(128).nullable().optional(),
  address: z.string().trim().max(512).nullable().optional(),
  status: z.enum(PLACE_STATUSES).default("unknown"),
});
export type PlaceCreateInput = z.infer<typeof placeCreateSchema>;

export const placeUpdateSchema = placeCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type PlaceUpdateInput = z.infer<typeof placeUpdateSchema>;
