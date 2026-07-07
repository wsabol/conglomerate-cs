import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { objectRevisions, users } from "../schema";
import type { RevisionDTO, UserDTO } from "@shared/dto";
import type { RevisionTargetType } from "@shared/types";

export async function listUsers(db: Db): Promise<UserDTO[]> {
  const rows = await db.select().from(users).orderBy(users.email);
  return rows.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    personId: user.personId,
    isDeleted: user.isDeleted,
  }));
}

export async function listRevisions(
  db: Db,
  q: { target_type?: RevisionTargetType; target_id?: number; limit: number },
): Promise<RevisionDTO[]> {
  const conds = [];
  if (q.target_type) {
    conds.push(eq(objectRevisions.targetType, q.target_type));
  }
  if (q.target_id) conds.push(eq(objectRevisions.targetId, q.target_id));

  const rows = await db
    .select({
      id: objectRevisions.id,
      targetId: objectRevisions.targetId,
      targetType: objectRevisions.targetType,
      action: objectRevisions.action,
      beforeJson: objectRevisions.beforeJson,
      afterJson: objectRevisions.afterJson,
      changedBy: objectRevisions.changedBy,
      changedAt: objectRevisions.changedAt,
      changedByEmail: users.email,
    })
    .from(objectRevisions)
    .leftJoin(users, eq(users.id, objectRevisions.changedBy))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(objectRevisions.changedAt))
    .limit(q.limit);

  return rows.map((row) => ({
    id: row.id,
    targetId: row.targetId,
    targetType: row.targetType,
    action: row.action,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    changedBy: row.changedBy,
    changedByEmail: row.changedByEmail,
    changedAt: row.changedAt,
  }));
}
