import { apiFetch } from "./api";
import type { AnnotationDTO } from "@shared/dto";
import {
  annotationCreateSchema,
  annotationUpdateSchema,
} from "@shared/schemas/annotation";
import type { z } from "zod";

export type AnnotationCreateBody = z.input<typeof annotationCreateSchema>;
export type AnnotationUpdateBody = z.input<typeof annotationUpdateSchema>;

export function createAnnotation(input: AnnotationCreateBody) {
  return apiFetch<AnnotationDTO>("/api/annotations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAnnotation(id: number, input: AnnotationUpdateBody) {
  return apiFetch<AnnotationDTO>(`/api/annotations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAnnotation(id: number) {
  return apiFetch<{ id: number }>(`/api/annotations/${id}`, {
    method: "DELETE",
  });
}
