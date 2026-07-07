import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import { annotationPeople, annotations, people, users } from "../schema";
import type { AnnotationDTO } from "@shared/dto";
import type { AnnotationTargetType } from "@shared/types";
import { localPart } from "./helpers";

export type AnnotationRow = {
  id: number;
  targetType: AnnotationDTO["targetType"];
  targetId: number;
  body: string;
  annotationType: AnnotationDTO["annotationType"];
  incorporatePref: AnnotationDTO["incorporatePref"];
  authorId: number | null;
  createdOn: string;
  modifiedOn: string;
  authorEmail: string | null;
  authorPersonName: string | null;
};

const annotationSelect = {
  id: annotations.id,
  targetType: annotations.targetType,
  targetId: annotations.targetId,
  body: annotations.body,
  annotationType: annotations.annotationType,
  incorporatePref: annotations.incorporatePref,
  authorId: annotations.authorId,
  createdOn: annotations.createdOn,
  modifiedOn: annotations.modifiedOn,
  authorEmail: users.email,
  authorPersonName: people.displayName,
};

export function toAnnotationDTO(
  row: AnnotationRow,
  peopleLinks: { id: number; displayName: string }[],
): AnnotationDTO {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    body: row.body,
    annotationType: row.annotationType,
    incorporatePref: row.incorporatePref,
    authorId: row.authorId,
    authorName:
      row.authorPersonName || localPart(row.authorEmail) || "A band member",
    createdOn: row.createdOn,
    modifiedOn: row.modifiedOn,
    people: peopleLinks,
  };
}

async function annotationPeopleByIds(
  db: Db,
  annotationIds: number[],
): Promise<Map<number, { id: number; displayName: string }[]>> {
  const byAnnotation = new Map<number, { id: number; displayName: string }[]>();
  if (annotationIds.length === 0) return byAnnotation;

  const links = await db
    .select({
      annotationId: annotationPeople.annotationId,
      personId: people.id,
      displayName: people.displayName,
    })
    .from(annotationPeople)
    .innerJoin(people, eq(people.id, annotationPeople.personId))
    .where(inArray(annotationPeople.annotationId, annotationIds));

  for (const link of links) {
    const list = byAnnotation.get(link.annotationId) ?? [];
    list.push({ id: link.personId, displayName: link.displayName });
    byAnnotation.set(link.annotationId, list);
  }

  return byAnnotation;
}

export async function getAnnotations(
  db: Db,
  targetType: AnnotationTargetType,
  targetId: number,
): Promise<AnnotationDTO[]> {
  const rows = await db
    .select(annotationSelect)
    .from(annotations)
    .leftJoin(users, eq(users.id, annotations.authorId))
    .leftJoin(people, eq(people.id, users.personId))
    .where(
      and(
        eq(annotations.targetType, targetType),
        eq(annotations.targetId, targetId),
        eq(annotations.isDeleted, false),
      ),
    )
    .orderBy(desc(annotations.createdOn));

  if (rows.length === 0) return [];

  const byAnnotation = await annotationPeopleByIds(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) =>
    toAnnotationDTO(row, byAnnotation.get(row.id) ?? []),
  );
}

export async function getAnnotationById(
  db: Db,
  id: number,
): Promise<AnnotationDTO | null> {
  const row = await db
    .select(annotationSelect)
    .from(annotations)
    .leftJoin(users, eq(users.id, annotations.authorId))
    .leftJoin(people, eq(people.id, users.personId))
    .where(and(eq(annotations.id, id), eq(annotations.isDeleted, false)))
    .get();

  if (!row) return null;

  const byAnnotation = await annotationPeopleByIds(db, [id]);
  return toAnnotationDTO(row, byAnnotation.get(id) ?? []);
}
