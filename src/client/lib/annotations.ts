import { apiFetch } from "./api";
import type { AnnotationDTO } from "@shared/dto";
import type {
  AnnotationType,
  AnnotationTargetType,
  IncorporatePref,
} from "@shared/types";

export interface AnnotationInput {
  targetType: AnnotationTargetType;
  targetId: number;
  body: string;
  annotationType: AnnotationType;
  incorporatePref: IncorporatePref;
  peopleIds: number[];
}

export function createAnnotation(input: AnnotationInput) {
  return apiFetch<AnnotationDTO>("/api/annotations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAnnotation(
  id: number,
  input: Partial<Omit<AnnotationInput, "targetType" | "targetId">>,
) {
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
