import { z } from "zod";
import { DATE_PRECISIONS } from "../types";

export const uploadCreateSchema = z.object({
  eventId: z.number().int().positive(),
  filename: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  title: z.string().trim().max(512).optional(),
});
export type UploadCreateInput = z.infer<typeof uploadCreateSchema>;

export const mediaUpdateSchema = z
  .object({
    title: z.string().trim().max(512).nullable().optional(),
    description: z.string().trim().max(10000).nullable().optional(),
    eventId: z.number().int().positive().nullable().optional(),
    capturedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    datePrecision: z.enum(DATE_PRECISIONS).optional(),
    provenance: z.string().trim().max(2000).nullable().optional(),
    peopleIds: z.array(z.number().int().positive()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type MediaUpdateInput = z.infer<typeof mediaUpdateSchema>;
