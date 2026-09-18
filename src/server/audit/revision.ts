import { SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { objectRevisions } from "../db/schema";
import type { RevisionAction, RevisionTargetType } from "@shared/types";

export interface RevisionInput {
  targetType: RevisionTargetType;
  targetId: number | SQL;
  action: RevisionAction;
  before?: unknown;
  after?: unknown;
  changedBy?: number | null;
  /** Guard the audit row in the same batch as a conditional mutation. */
  when?: SQL;
}

export function revisionValues(input: RevisionInput) {
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    beforeJson: input.before instanceof SQL ? input.before : input.before != null ? JSON.stringify(input.before) : null,
    afterJson: input.after instanceof SQL ? input.after : input.after != null ? JSON.stringify(input.after) : null,
    changedBy: input.changedBy ?? null,
  };
}

/** Await directly, or include this lazy statement in the mutation's D1 batch. */
export function recordRevision(db: Db, input: RevisionInput) {
  const values = revisionValues(input);
  const changed = input.action === "update" && values.beforeJson !== null && values.afterJson !== null
    ? sql`${values.beforeJson} IS NOT ${values.afterJson}`
    : null;
  const condition = input.when && changed ? sql`(${input.when}) AND (${changed})` : input.when ?? changed;
  if (condition) {
    return db.insert(objectRevisions).select(sql`
      SELECT NULL, ${values.targetId}, ${values.targetType}, ${values.action},
        ${values.beforeJson}, ${values.afterJson}, ${values.changedBy}, CURRENT_TIMESTAMP
      WHERE ${condition}
    `);
  }
  return db.insert(objectRevisions).values(values);
}

/** A drizzle insert statement for batching alongside the triggering mutation. */
export function revisionStatement(db: Db, input: RevisionInput) {
  return db.insert(objectRevisions).values(revisionValues(input));
}
