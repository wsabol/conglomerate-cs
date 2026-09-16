import { eq } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { Db } from "../client";
import { media, type MediaRow } from "../schema";
import { mediaRowSnapshot } from "../queries";
import { recordRevision } from "../../audit/revision";
import { notFound } from "../../lib/errors";
import { commitConfidenceBatch, confidenceStatementsForMedia, type MutationStatement } from "./confidence";
import type { MediaStatus, RevisionAction } from "@shared/types";

type MediaConfidenceUpdate = Omit<SQLiteUpdateSetSource<typeof media>, "status" | "isDeleted"> & {
  status?: MediaStatus;
  isDeleted?: boolean;
};

/** Eligibility transitions (and explicit create/delete audits) share one D1 batch with scores. */
export async function updateMediaWithConfidence(
  db: Db, id: number, fields: MediaConfidenceUpdate,
  changedBy: number | null = null, action: RevisionAction = "update",
  additionalStatements: MutationStatement[] = [],
): Promise<MediaRow> {
  const existing = await db.select().from(media).where(eq(media.id, id)).get();
  if (!existing) throw notFound("Media not found.");
  const status = fields.status ?? existing.status;
  const deleted = fields.isDeleted ?? existing.isDeleted;
  const wasEligible = existing.status === "published" && !existing.isDeleted;
  const eligible = status === "published" && !deleted;
  const eligibilityChanged = wasEligible !== eligible;
  const shouldAudit = eligibilityChanged || action !== "update";

  if (!eligibilityChanged && !shouldAudit && additionalStatements.length === 0) {
    await db.update(media).set(fields).where(eq(media.id, id));
    return (await db.select().from(media).where(eq(media.id, id)).get())!;
  }

  const confidenceStatements = eligibilityChanged
    ? await confidenceStatementsForMedia(db, id, eligible, changedBy) : [];
  const statements: MutationStatement[] = [
    ...confidenceStatements,
    db.update(media).set(fields).where(eq(media.id, id)),
    ...additionalStatements,
  ];
  if (shouldAudit) {
    statements.push(recordRevision(db, { targetType: "media", targetId: id, action, before: existing,
      after: mediaRowSnapshot(id), changedBy }));
  }
  await commitConfidenceBatch(db, statements as [MutationStatement, ...MutationStatement[]]);
  return (await db.select().from(media).where(eq(media.id, id)).get())!;
}
