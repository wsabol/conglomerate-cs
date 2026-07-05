import { z } from "zod";

export const personCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  aliases: z.string().trim().max(2000).nullable().optional(),
  bio: z.string().trim().max(10000).nullable().optional(),
});
export type PersonCreateInput = z.infer<typeof personCreateSchema>;

export const personUpdateSchema = personCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;
