import { and, desc, eq, or } from "drizzle-orm";
import type { Db } from "../client";
import { annotations, events, media, objectRevisions, people, users } from "../schema";
import type { RecentActivityDTO } from "@shared/dto";
import { localPart } from "./helpers";

export async function getRecentActivity(db: Db, limit: number): Promise<RecentActivityDTO[]> {
  const rows = await db.select({
    id: objectRevisions.id,
    targetType: objectRevisions.targetType,
    changedAt: objectRevisions.changedAt,
    eventName: events.name,
    eventSlug: events.slug,
    personName: people.displayName,
    email: users.email,
  })
    .from(objectRevisions)
    .leftJoin(annotations, and(
      eq(objectRevisions.targetType, "annotation"),
      eq(annotations.id, objectRevisions.targetId),
      eq(annotations.isDeleted, false),
    ))
    .leftJoin(media, and(
      eq(annotations.targetType, "media"),
      eq(media.id, annotations.targetId),
      eq(media.isDeleted, false),
    ))
    .innerJoin(events, and(
      eq(events.isDeleted, false),
      or(
        and(eq(objectRevisions.targetType, "event"), eq(events.id, objectRevisions.targetId)),
        and(eq(objectRevisions.targetType, "annotation"), or(
          and(eq(annotations.targetType, "event"), eq(events.id, annotations.targetId)),
          and(eq(annotations.targetType, "media"), eq(events.id, media.eventId)),
        )),
      ),
    ))
    .leftJoin(users, eq(users.id, objectRevisions.changedBy))
    .leftJoin(people, eq(people.id, users.personId))
    .where(and(
      eq(objectRevisions.action, "create"),
      or(eq(objectRevisions.targetType, "event"), eq(objectRevisions.targetType, "annotation")),
    ))
    .orderBy(desc(objectRevisions.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    kind: row.targetType === "annotation" ? "annotation" : "event",
    actorName: row.personName || localPart(row.email) || "A band member",
    eventName: row.eventName,
    eventSlug: row.eventSlug,
    changedAt: row.changedAt,
  }));
}
