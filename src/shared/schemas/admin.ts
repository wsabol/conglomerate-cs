import { z } from "zod";
import { REVISION_TARGET_TYPES, USER_ROLES } from "../types";

export const userUpdateSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isDeleted: z.boolean().optional(),
  personId: z.number().int().positive().nullable().optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const revisionsQuerySchema = z.object({
  target_type: z.enum(REVISION_TARGET_TYPES).optional(),
  target_id: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type RevisionsQuery = z.infer<typeof revisionsQuerySchema>;

export const confidenceBackfillSchema = z.object({
  dry_run: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  after_id: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().optional(),
});
export type ConfidenceBackfillInput = z.infer<typeof confidenceBackfillSchema>;
