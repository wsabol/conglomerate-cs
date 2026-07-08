import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { people } from "../schema";
import type {
  PersonCreateInput,
  PersonUpdateInput,
} from "@shared/schemas/person";
import { recordRevision } from "../../audit/revision";
import { getPerson } from "../queries";

export async function createPerson(
  db: Db,
  input: PersonCreateInput,
  changedBy: number,
) {
  const inserted = await db
    .insert(people)
    .values({
      displayName: input.displayName,
      aliases: input.aliases ?? null,
      bio: input.bio ?? null,
    })
    .returning()
    .get();

  await recordRevision(db, {
    targetType: "people",
    targetId: inserted.id,
    action: "create",
    after: inserted,
    changedBy,
  });

  return inserted;
}

/** Create multiple people in one insert; dedupes by trimmed display name. */
export async function createPeopleBatch(
  db: Db,
  inputs: PersonCreateInput[],
  changedBy: number,
): Promise<Map<string, number>> {
  const unique = new Map<string, PersonCreateInput>();
  for (const input of inputs) {
    const key = input.displayName.trim().toLowerCase();
    if (!unique.has(key)) unique.set(key, input);
  }
  if (unique.size === 0) return new Map();

  const inserted = await db
    .insert(people)
    .values(
      [...unique.values()].map((input) => ({
        displayName: input.displayName,
        aliases: input.aliases ?? null,
        bio: input.bio ?? null,
      })),
    )
    .returning();

  for (const row of inserted) {
    await recordRevision(db, {
      targetType: "people",
      targetId: row.id,
      action: "create",
      after: row,
      changedBy,
    });
  }

  return new Map(
    inserted.map((row) => [row.displayName.trim().toLowerCase(), row.id]),
  );
}

export async function updatePerson(
  db: Db,
  id: number,
  input: PersonUpdateInput,
  changedBy: number,
) {
  const existing = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.isDeleted, false)))
    .get();
  if (!existing) return null;

  await db
    .update(people)
    .set({
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(people.id, id));

  const updated = await db.select().from(people).where(eq(people.id, id)).get();

  await recordRevision(db, {
    targetType: "people",
    targetId: id,
    action: "update",
    before: existing,
    after: updated,
    changedBy,
  });

  return getPerson(db, id);
}

export async function softDeletePerson(
  db: Db,
  id: number,
  changedBy: number,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.isDeleted, false)))
    .get();
  if (!existing) return false;

  await db
    .update(people)
    .set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(people.id, id));

  await recordRevision(db, {
    targetType: "people",
    targetId: id,
    action: "delete",
    before: existing,
    changedBy,
  });
  return true;
}
