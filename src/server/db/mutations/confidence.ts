import { CONFIDENCE_BACKFILL_MAX_BATCH } from "../../lib/config";
import { eq, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../client";
import { events } from "../schema";
import { recordRevision } from "../../audit/revision";
import { conflict } from "../../lib/errors";
import { getEventConfidenceContext, assessConfidenceContext, getEventsCitingMedia, listConfidenceBackfillIds, eventRowSnapshot, getMediaCitationSnapshot } from "../queries";
import type { ConfidenceBackfillResult } from "@shared/dto";
import type { ConfidenceBackfillInput } from "@shared/schemas/admin";

export type MutationStatement = BatchItem<"sqlite">;

/** Fail the whole D1 batch if evidence changed after the evaluator read it. */
export function confidenceSnapshotGuard(db: Db, expression: SQL, expected: string) {
  return db.select({ checked: sql`json(CASE WHEN ${expression} = ${expected}
    THEN 'null' ELSE 'stale_confidence_snapshot' END)` }).from(sql`(SELECT 1)`);
}

export async function commitConfidenceBatch(db: Db, statements: [MutationStatement, ...MutationStatement[]]) {
  try {
    return await db.batch(statements);
  } catch (error) {
    // SQLite evaluates json() only on the selected CASE branch. A stale read
    // aborts the transaction rather than persisting a score for different facts.
    let cause: unknown = error;
    while (cause instanceof Error) {
      if (cause.message.includes("malformed JSON")) {
        throw conflict("The event or its evidence changed while saving. Please reload and try again.");
      }
      cause = cause.cause;
    }
    throw error;
  }
}

export async function confidenceStatementsForMedia(db: Db, mediaId: number, eligible: boolean, changedBy: number | null) {
  const statements: MutationStatement[] = [];
  // Guard references too: a concurrently added citation must not be missed.
  const references = await getMediaCitationSnapshot(db, mediaId);
  statements.push(confidenceSnapshotGuard(db, references.expression, references.snapshot));
  const rows = await getEventsCitingMedia(db, mediaId);
  for (const row of rows) {
    const context = await getEventConfidenceContext(db, row.id);
    if (!context || context.event.isDeleted) continue;
    statements.push(confidenceSnapshotGuard(db, context.expression, context.snapshot));
    const ids = new Set(context.eligibleMediaIds);
    if (eligible) ids.add(mediaId); else ids.delete(mediaId);
    const assessment = assessConfidenceContext({ ...context, eligibleMediaIds: [...ids] });
    if (assessment.level === context.event.confidence) continue;
    statements.push(
      db.update(events).set({ confidence: assessment.level }).where(eq(events.id, row.id)),
      recordRevision(db, { targetType: "event", targetId: row.id, action: "update",
        before: context.event, after: eventRowSnapshot(row.id), changedBy }),
    );
  }
  // All guards must run before the media/event mutations.
  return statements;
}

export async function runConfidenceBackfill(db: Db, input: ConfidenceBackfillInput): Promise<ConfidenceBackfillResult> {
  const limit = input.limit ?? CONFIDENCE_BACKFILL_MAX_BATCH;
  const ids = await listConfidenceBackfillIds(db, input.after_id, limit);
  const rows: ConfidenceBackfillResult["results"] = [];
  for (const { id } of ids) {
    const context = await getEventConfidenceContext(db, id);
    if (!context || context.event.isDeleted) continue;
    const assessment = assessConfidenceContext(context);
    const changed = assessment.level !== context.event.confidence;
    if (!input.dry_run && changed) {
      await commitConfidenceBatch(db, [
        confidenceSnapshotGuard(db, context.expression, context.snapshot),
        db.update(events).set({ confidence: assessment.level }).where(eq(events.id, id)),
        recordRevision(db, { targetType: "event", targetId: id, action: "update",
          before: context.event, after: eventRowSnapshot(id), changedBy: null }),
      ]);
    }
    rows.push({ eventId: id, previousLevel: context.event.confidence, assessment, changed });
  }
  return { dryRun: input.dry_run, results: rows,
    nextAfterId: ids.length === limit ? ids[ids.length - 1].id : null };
}
