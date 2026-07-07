import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { eventActs, people, places } from "../schema";
import type { PersonDTO, PlaceDTO } from "@shared/dto";
import { toPlaceDTO } from "./helpers";

export async function listPeople(db: Db): Promise<PersonDTO[]> {
  const rows = await db
    .select()
    .from(people)
    .where(eq(people.isDeleted, false))
    .orderBy(people.displayName);
  return rows.map((person) => ({
    id: person.id,
    displayName: person.displayName,
    aliases: person.aliases,
    bio: person.bio,
  }));
}

export async function getPerson(
  db: Db,
  id: number,
): Promise<PersonDTO | null> {
  const person = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.isDeleted, false)))
    .get();

  return person
    ? {
        id: person.id,
        displayName: person.displayName,
        aliases: person.aliases,
        bio: person.bio,
      }
    : null;
}

export async function listPlaces(db: Db): Promise<PlaceDTO[]> {
  const rows = await db
    .select()
    .from(places)
    .where(eq(places.isDeleted, false))
    .orderBy(places.name);
  return rows.map(toPlaceDTO);
}

export async function getPlace(db: Db, id: number): Promise<PlaceDTO | null> {
  const place = await db
    .select()
    .from(places)
    .where(and(eq(places.id, id), eq(places.isDeleted, false)))
    .get();
  return place ? toPlaceDTO(place) : null;
}

export async function listActNames(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: eventActs.name })
    .from(eventActs)
    .orderBy(eventActs.name);
  return rows.map((row) => row.name);
}
