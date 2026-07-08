import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { places } from "../schema";
import type {
  PlaceCreateInput,
  PlaceUpdateInput,
} from "@shared/schemas/place";
import { recordRevision } from "../../audit/revision";
import { getPlace } from "../queries";

export async function createPlace(
  db: Db,
  input: PlaceCreateInput,
  changedBy: number,
) {
  const inserted = await db
    .insert(places)
    .values({
      name: input.name,
      placeType: input.placeType ?? null,
      address: input.address ?? null,
      status: input.status,
    })
    .returning()
    .get();

  await recordRevision(db, {
    targetType: "places",
    targetId: inserted.id,
    action: "create",
    after: inserted,
    changedBy,
  });

  return getPlace(db, inserted.id);
}

export async function updatePlace(
  db: Db,
  id: number,
  input: PlaceUpdateInput,
  changedBy: number,
) {
  const existing = await db
    .select()
    .from(places)
    .where(and(eq(places.id, id), eq(places.isDeleted, false)))
    .get();
  if (!existing) return null;

  await db
    .update(places)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.placeType !== undefined ? { placeType: input.placeType } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      modifiedOn: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(places.id, id));

  const updated = await db.select().from(places).where(eq(places.id, id)).get();

  await recordRevision(db, {
    targetType: "places",
    targetId: id,
    action: "update",
    before: existing,
    after: updated,
    changedBy,
  });

  return getPlace(db, id);
}

export async function softDeletePlace(
  db: Db,
  id: number,
  changedBy: number,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(places)
    .where(and(eq(places.id, id), eq(places.isDeleted, false)))
    .get();
  if (!existing) return false;

  await db
    .update(places)
    .set({ isDeleted: true, modifiedOn: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(places.id, id));

  await recordRevision(db, {
    targetType: "places",
    targetId: id,
    action: "delete",
    before: existing,
    changedBy,
  });
  return true;
}
