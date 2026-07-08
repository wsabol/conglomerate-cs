import { z } from "zod";
import {
  ANNOTATION_TARGET_TYPES,
  ANNOTATION_TYPES,
  INCORPORATE_PREFS,
} from "../types";

export const annotationCreateSchema = z.object({
  targetType: z.enum(ANNOTATION_TARGET_TYPES),
  targetId: z.number().int().positive(),
  body: z.string().trim().min(1, "Write something first.").max(10000),
  annotationType: z.enum(ANNOTATION_TYPES).default("personal_memory"),
  incorporatePref: z.enum(INCORPORATE_PREFS).default("no_pref"),
  peopleIds: z.array(z.number().int().positive()).default([]),
});
export type AnnotationCreateInput = z.infer<typeof annotationCreateSchema>;

export const annotationUpdateSchema = z
  .object({
    body: z.string().trim().min(1).max(10000).optional(),
    annotationType: z.enum(ANNOTATION_TYPES).optional(),
    incorporatePref: z.enum(INCORPORATE_PREFS).optional(),
    peopleIds: z.array(z.number().int().positive()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Nothing to update.",
  });
export type AnnotationUpdateInput = z.infer<typeof annotationUpdateSchema>;

export const memoryFormSchema = annotationCreateSchema.pick({
  body: true,
  annotationType: true,
  incorporatePref: true,
  peopleIds: true,
});
export type MemoryFormValue = z.infer<typeof memoryFormSchema>;
