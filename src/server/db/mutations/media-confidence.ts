import { eq } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { Db } from "../client";
import { media, type MediaRow } from "../schema";
import { getMediaConfidenceSnapshot } from "../queries";
import { recordRevision } from "../../audit/revision";
import { notFound } from "../../lib/errors";
import { commitConfidenceBatch, confidenceSnapshotGuard, confidenceStatementsForMedia, type MutationStatement } from "./confidence";
import type { MediaStatus, RevisionAction } from "@shared/types";

type MediaConfidenceUpdate = Omit<SQLiteUpdateSetSource<typeof media>, "status" | "isDeleted"> & {
  status?: MediaStatus;
  isDeleted?: boolean;
};

/** Every transition into/out of eligible source media and its scores commit together. */
export async function updateMediaWithConfidence(
  db: Db, id: number, fields: MediaConfidenceUpdate,
  changedBy: number | null = null, action: RevisionAction = "update",
  additionalStatements: MutationStatement[] = [],
): Promise<MediaRow> {
  const { expression, snapshot } = await getMediaConfidenceSnapshot(db, id);
  if (!snapshot) throw notFound("Media not found.");
  const existing = JSON.parse(snapshot) as MediaRow;
  existing.isDeleted = Boolean(existing.isDeleted);
  const status = fields.status ?? existing.status;
  const deleted = fields.isDeleted ?? existing.isDeleted;
  const wasEligible = existing.status === "published" && !existing.isDeleted;
  const eligible = status === "published" && !deleted;
  const confidenceStatements = wasEligible !== eligible
    ? await confidenceStatementsForMedia(db, id, eligible, changedBy) : [];
  await commitConfidenceBatch(db, [
    confidenceSnapshotGuard(db, expression, snapshot),
    ...confidenceStatements,
    db.update(media).set(fields).where(eq(media.id, id)),
    ...additionalStatements,
    recordRevision(db, { targetType: "media", targetId: id, action, before: existing,
      after: expression, changedBy }),
  ]);
  return (await db.select().from(media).where(eq(media.id, id)).get())!;
}
