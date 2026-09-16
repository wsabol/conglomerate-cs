import { CONFIDENCE_BACKFILL_MAX_BATCH } from "../../lib/config";
import { eq, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../client";
import { events, confidenceSnapshotGuardRow } from "../schema";
import { recordRevision } from "../../audit/revision";
import { conflict } from "../../lib/errors";
import { getEventConfidenceContext, assessConfidenceContext, getEventsCitingMedia, listConfidenceBackfillIds, eventRowSnapshot, getMediaCitationSnapshot } from "../queries";
import type { ConfidenceBackfillResult } from "@shared/dto";
import type { ConfidenceBackfillInput } from "@shared/schemas/admin";

export type MutationStatement = BatchItem<"sqlite">;

function errorText(error: unknown): string {
  const chunks: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (value == null || depth > 6) return;
    if (typeof value === "string") {
      chunks.push(value);
      return;
    }
    if (typeof value !== "object") return;
    if (value instanceof Error) {
      chunks.push(value.message, value.name, value.stack ?? "");
      visit(value.cause, depth + 1);
      return;
    }
    for (const nested of Object.values(value)) visit(nested, depth + 1);
  };
  visit(error, 0);
  return chunks.join("\n");
}

function isStaleConfidenceSnapshotError(error: unknown): boolean {
  return errorText(error).includes("stale_confidence_snapshot");
}

/** Fail the whole D1 batch if evidence changed after the evaluator read it. */
export function confidenceSnapshotGuard(db: Db, expression: SQL, expected: string) {
  // Setting ok=0 violates named CHECK stale_confidence_snapshot and aborts the
  // transaction. json() / missing functions either collide with other errors or fail at prepare.
  return db.update(confidenceSnapshotGuardRow)
    .set({ ok: sql`CASE WHEN ${expression} = ${expected} THEN 1 ELSE 0 END` })
    .where(eq(confidenceSnapshotGuardRow.id, 1));
}

export async function commitConfidenceBatch(db: Db, statements: [MutationStatement, ...MutationStatement[]]) {
  try {
    return await db.batch(statements);
  } catch (error) {
    if (isStaleConfidenceSnapshotError(error)) {
      throw conflict("The event or its evidence changed while saving. Please reload and try again.");
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
