import { apiFetch } from "./api";
import type { PersonDTO } from "@shared/dto";
import { personCreateSchema } from "@shared/schemas/person";
import type { ListResult } from "@shared/types";
import type { z } from "zod";

export type PersonCreateBody = z.input<typeof personCreateSchema>;

let peopleList: Promise<ListResult<PersonDTO>> | null = null;

/** Drop the cached people list so the next `listPeople()` hits the network. */
export function invalidatePeopleList() {
  peopleList = null;
}

/** Session-cached people directory. Failed fetches are not cached. */
export function listPeople() {
  if (!peopleList) {
    peopleList = apiFetch<ListResult<PersonDTO>>("/api/people").catch(
      (error) => {
        peopleList = null;
        throw error;
      },
    );
  }
  return peopleList;
}

export async function createPerson(body: PersonCreateBody) {
  const person = await apiFetch<PersonDTO>("/api/people", {
    method: "POST",
    body: JSON.stringify(body),
  });
  invalidatePeopleList();
  return person;
}

function personTypeLabel(personType: string | null): string {
  const normalized = personType?.trim();
  if (!normalized) return "Other";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** Build person select options grouped by type, with untyped people last. */
export function personSelectOptions(people: PersonDTO[]) {
  return [...people]
    .map((person) => ({
      value: String(person.id),
      label: person.displayName,
      group: personTypeLabel(person.personType),
    }))
    .sort((a, b) => {
      if (a.group === "Other" && b.group !== "Other") return 1;
      if (b.group === "Other" && a.group !== "Other") return -1;
      return a.group.localeCompare(b.group) || a.label.localeCompare(b.label);
    });
}
