import type { Db } from "../db/client";
import { objectRevisions } from "../db/schema";
import type { RevisionAction, RevisionTargetType } from "@shared/types";

export interface RevisionInput {
  targetType: RevisionTargetType;
  targetId: number;
  action: RevisionAction;
  before?: unknown;
  after?: unknown;
  changedBy?: number | null;
}

export function revisionValues(input: RevisionInput) {
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    beforeJson: input.before != null ? JSON.stringify(input.before) : null,
    afterJson: input.after != null ? JSON.stringify(input.after) : null,
    changedBy: input.changedBy ?? null,
  };
}

/** Insert an audit row. Prefer batching via `revisionStatement` with the mutation. */
export async function recordRevision(db: Db, input: RevisionInput) {
  await db.insert(objectRevisions).values(revisionValues(input));
}

/** A drizzle insert statement for batching alongside the triggering mutation. */
export function revisionStatement(db: Db, input: RevisionInput) {
  return db.insert(objectRevisions).values(revisionValues(input));
}
