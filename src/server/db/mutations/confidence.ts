import { CONFIDENCE_BACKFILL_MAX_BATCH } from "../../lib/config";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../client";
import { events } from "../schema";
import { recordRevision } from "../../audit/revision";
import { getEventConfidenceContext, assessConfidenceContext, getEventsCitingMedia, listConfidenceBackfillIds, eventRowSnapshot } from "../queries";
import type { ConfidenceBackfillResult } from "@shared/dto";
import type { ConfidenceBackfillInput } from "@shared/schemas/admin";

export type MutationStatement = BatchItem<"sqlite">;

export async function commitConfidenceBatch(db: Db, statements: [MutationStatement, ...MutationStatement[]]) {
  return db.batch(statements);
}

export async function confidenceStatementsForMedia(db: Db, mediaId: number, eligible: boolean, changedBy: number | null) {
  const statements: MutationStatement[] = [];
  const rows = await getEventsCitingMedia(db, mediaId);
  for (const row of rows) {
    const context = await getEventConfidenceContext(db, row.id);
    if (!context || context.event.isDeleted) continue;
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
