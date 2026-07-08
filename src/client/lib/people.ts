import { apiFetch } from "./api";
import type { PersonDTO } from "@shared/dto";
import { personCreateSchema } from "@shared/schemas/person";
import type { ListResult } from "@shared/types";
import type { z } from "zod";

export type PersonCreateBody = z.input<typeof personCreateSchema>;

export function listPeople() {
  return apiFetch<ListResult<PersonDTO>>("/api/people");
}

export function createPerson(body: PersonCreateBody) {
  return apiFetch<PersonDTO>("/api/people", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
