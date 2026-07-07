import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import type { Db } from "./client";
import {
  annotationPeople,
  annotations,
  eventActs,
  eventPeople,
  eventPerformanceDetails,
  eventSources,
  events,
  media,
  mediaPeople,
  objectRevisions,
  people,
  places,
  users,
} from "./schema";
import type { EventsQuery, MediaQuery } from "@shared/schemas/query";
import type {
  AnnotationDTO,
  EventDetailDTO,
  EventListItemDTO,
  MediaAvailabilityDTO,
  MediaItemDTO,
  PersonDTO,
  PlaceDTO,
  RevisionDTO,
  UserDTO,
} from "@shared/dto";
import type { AnnotationTargetType, RevisionTargetType } from "@shared/types";
import { mediaDeliveryUrl, mediaThumbUrl } from "../media/url";

const emptyAvailability = (): MediaAvailabilityDTO => ({
  photo: false,
  video: false,
  audio: false,
  setlist: false,
});

// ---- Events -----------------------------------------------------------------

export async function listEvents(
  db: Db,
  q: EventsQuery,
): Promise<EventListItemDTO[]> {
  const conds = [eq(events.isDeleted, false)];
  if (q.event_type) conds.push(eq(events.eventType, q.event_type));
  if (q.place) conds.push(eq(events.placeId, q.place));
  if (q.year) conds.push(like(events.eventDate, `${q.year}-%`));
  if (q.q) {
    const term = `%${q.q}%`;
    const match = or(like(events.name, term), like(events.summary, term));
    if (match) conds.push(match);
  }
  if (q.person) {
    conds.push(
      inArray(
        events.id,
        db
          .select({ id: eventPeople.eventId })
          .from(eventPeople)
          .where(
            and(
              eq(eventPeople.personId, q.person),
              eq(eventPeople.isDeleted, false),
            ),
          ),
      ),
    );
  }
  if (q.lineup) {
    conds.push(
      inArray(
        events.id,
        db
          .select({ id: eventActs.eventId })
          .from(eventActs)
          .where(eq(eventActs.billingRole, q.lineup)),
      ),
    );
  }

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      eventType: events.eventType,
      eventDate: events.eventDate,
      eventTime: events.eventTime,
      datePrecision: events.datePrecision,
      confidence: events.confidence,
      heroImageId: events.heroImageId,
      placeId: places.id,
      placeName: places.name,
      billingName: eventPerformanceDetails.billingName,
      setlistText: eventPerformanceDetails.setlistText,
    })
    .from(events)
    .leftJoin(places, eq(places.id, events.placeId))
    .leftJoin(
      eventPerformanceDetails,
      eq(eventPerformanceDetails.eventId, events.id),
    )
    .where(and(...conds))
    .orderBy(q.sort === "date" ? desc(events.eventDate) : desc(events.modifiedOn));

  const availability = await mediaAvailability(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((r) => {
    const avail = availability.get(r.id) ?? emptyAvailability();
    avail.setlist = avail.setlist || Boolean(r.setlistText);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      title: r.name ?? r.billingName ?? "",
      eventType: r.eventType,
      eventDate: r.eventDate,
      eventTime: r.eventTime,
      datePrecision: r.datePrecision,
      confidence: r.confidence,
      place: r.placeId ? { id: r.placeId, name: r.placeName ?? "" } : null,
      heroImageId: r.heroImageId,
      heroImageUrl: r.heroImageId ? mediaDeliveryUrl(r.heroImageId) : null,
      media: avail,
    };
  });
}

async function mediaAvailability(
  db: Db,
  eventIds: number[],
): Promise<Map<number, MediaAvailabilityDTO>> {
  const map = new Map<number, MediaAvailabilityDTO>();
  if (eventIds.length === 0) return map;

  const rows = await db
    .select({ eventId: media.eventId, mediaType: media.mediaType })
    .from(media)
    .where(
      and(
        inArray(media.eventId, eventIds),
        eq(media.status, "published"),
        eq(media.isDeleted, false),
      ),
    );

  for (const row of rows) {
    if (row.eventId == null) continue;
    const avail = map.get(row.eventId) ?? emptyAvailability();
    if (row.mediaType === "photo") avail.photo = true;
    if (row.mediaType === "video") avail.video = true;
    if (row.mediaType === "audio") avail.audio = true;
    map.set(row.eventId, avail);
  }
  return map;
}

export async function getEventDetail(
  db: Db,
  slug: string,
): Promise<EventDetailDTO | null> {
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.isDeleted, false)))
    .get();
  if (!event) return null;

  const place = event.placeId
    ? ((await db
        .select()
        .from(places)
        .where(eq(places.id, event.placeId))
        .get()) ?? null)
    : null;

  const perf = await db
    .select()
    .from(eventPerformanceDetails)
    .where(eq(eventPerformanceDetails.eventId, event.id))
    .get();

  const peopleRows = await db
    .select({
      personId: eventPeople.personId,
      relationshipType: eventPeople.relationshipType,
      notes: eventPeople.notes,
      displayName: people.displayName,
    })
    .from(eventPeople)
    .innerJoin(people, eq(people.id, eventPeople.personId))
    .where(
      and(eq(eventPeople.eventId, event.id), eq(eventPeople.isDeleted, false)),
    );

  const acts = await db
    .select()
    .from(eventActs)
    .where(eq(eventActs.eventId, event.id));

  const sources = await db
    .select()
    .from(eventSources)
    .where(eq(eventSources.eventId, event.id));

  const mediaItems = await listMediaForEvent(db, event.id);
  const eventAnnotations = await getAnnotations(db, "event", event.id);

  const heroImageId = event.heroImageId ?? null;
  const posterId = perf?.eventPosterId ?? null;
  const resolvedHeroId = heroImageId ?? posterId;

  const placeDTO: PlaceDTO | null = place
    ? {
        id: place.id,
        name: place.name,
        placeType: place.placeType,
        address: place.address,
        status: place.status,
      }
    : null;

  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    title: event.name ?? perf?.billingName ?? "",
    eventType: event.eventType,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    datePrecision: event.datePrecision,
    confidence: event.confidence,
    place: place ? { id: place.id, name: place.name } : null,
    heroImageId: resolvedHeroId,
    heroImageUrl: resolvedHeroId ? mediaDeliveryUrl(resolvedHeroId) : null,
    media: {
      photo: mediaItems.some((m) => m.mediaType === "photo"),
      video: mediaItems.some((m) => m.mediaType === "video"),
      audio: mediaItems.some((m) => m.mediaType === "audio"),
      setlist: Boolean(perf?.setlistText),
    },
    summary: event.summary,
    placeDetail: placeDTO,
    performance: perf
      ? {
          billingName: perf.billingName,
          promotionText: perf.promotionText,
          setlistText: perf.setlistText,
          eventPosterId: perf.eventPosterId ?? null,
          eventPosterUrl: perf.eventPosterId
            ? mediaDeliveryUrl(perf.eventPosterId)
            : null,
        }
      : null,
    people: peopleRows.map((p) => ({
      personId: p.personId,
      displayName: p.displayName,
      relationshipType: p.relationshipType,
      notes: p.notes,
    })),
    acts: acts.map((a) => ({
      id: a.id,
      name: a.name,
      billingRole: a.billingRole,
    })),
    sources: sources.map((s) => ({
      id: s.id,
      sourceType: s.sourceType,
      description: s.description,
      url: s.url,
      mediaId: s.mediaId ?? null,
    })),
    mediaItems,
    annotations: eventAnnotations,
  };
}

// ---- Media ------------------------------------------------------------------

export async function listMediaForEvent(
  db: Db,
  eventId: number,
): Promise<MediaItemDTO[]> {
  const rows = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.eventId, eventId),
        eq(media.status, "published"),
        eq(media.isDeleted, false),
      ),
    )
    .orderBy(desc(media.createdOn));
  return attachMediaPeople(db, rows);
}

export async function listMedia(
  db: Db,
  q: MediaQuery,
): Promise<MediaItemDTO[]> {
  const conds = [eq(media.status, "published"), eq(media.isDeleted, false)];
  if (q.media_type) conds.push(eq(media.mediaType, q.media_type));
  if (q.year) conds.push(like(media.capturedDate, `${q.year}-%`));
  if (q.person) {
    conds.push(
      inArray(
        media.id,
        db
          .select({ id: mediaPeople.mediaId })
          .from(mediaPeople)
          .where(eq(mediaPeople.personId, q.person)),
      ),
    );
  }
  const rows = await db
    .select({
      media: media,
      eventSlug: events.slug,
      eventName: events.name,
      billingName: eventPerformanceDetails.billingName,
    })
    .from(media)
    .leftJoin(events, eq(events.id, media.eventId))
    .leftJoin(
      eventPerformanceDetails,
      eq(eventPerformanceDetails.eventId, media.eventId),
    )
    .where(and(...conds))
    .orderBy(desc(media.createdOn));

  return attachMediaPeople(
    db,
    rows.map((r) => r.media),
    rows.map((r) => ({
      id: r.media.id,
      slug: r.eventSlug,
      title: r.billingName || r.eventName,
    })),
  );
}

export async function getMediaItemById(
  db: Db,
  id: number,
): Promise<MediaItemDTO | null> {
  const row = await db
    .select({
      media: media,
      eventSlug: events.slug,
      eventName: events.name,
      billingName: eventPerformanceDetails.billingName,
    })
    .from(media)
    .leftJoin(events, eq(events.id, media.eventId))
    .leftJoin(
      eventPerformanceDetails,
      eq(eventPerformanceDetails.eventId, media.eventId),
    )
    .where(and(eq(media.id, id), eq(media.isDeleted, false)))
    .get();
  if (!row) return null;
  const [dto] = await attachMediaPeople(
    db,
    [row.media],
    [{ id: row.media.id, slug: row.eventSlug, title: row.billingName || row.eventName }],
  );
  return dto ?? null;
}

async function attachMediaPeople(
  db: Db,
  rows: (typeof media.$inferSelect)[],
  eventMeta?: { id: number; slug: string | null; title: string | null }[],
): Promise<MediaItemDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const links = await db
    .select({
      mediaId: mediaPeople.mediaId,
      personId: people.id,
      displayName: people.displayName,
    })
    .from(mediaPeople)
    .innerJoin(people, eq(people.id, mediaPeople.personId))
    .where(inArray(mediaPeople.mediaId, ids));

  const byMedia = new Map<number, { id: number; displayName: string }[]>();
  for (const l of links) {
    const list = byMedia.get(l.mediaId) ?? [];
    list.push({ id: l.personId, displayName: l.displayName });
    byMedia.set(l.mediaId, list);
  }

  const eventByMediaId = new Map(
    (eventMeta ?? []).map((e) => [e.id, e]),
  );

  return rows.map((r) => {
    const ev = eventByMediaId.get(r.id);
    return {
      id: r.id,
      title: r.title,
      mediaType: r.mediaType,
      status: r.status,
      capturedDate: r.capturedDate,
      datePrecision: r.datePrecision,
      description: r.description,
      eventId: r.eventId,
      eventSlug: ev?.slug ?? null,
      eventTitle: ev?.title ?? null,
      provenance: r.provenance,
      url: r.mediaType === "link" ? r.externalUrl : mediaDeliveryUrl(r.id),
      thumbUrl: r.thumbKey ? mediaThumbUrl(r.id) : null,
      people: byMedia.get(r.id) ?? [],
    };
  });
}

// ---- Annotations ------------------------------------------------------------

export async function getAnnotations(
  db: Db,
  targetType: AnnotationTargetType,
  targetId: number,
): Promise<AnnotationDTO[]> {
  const rows = await db
    .select({
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
    })
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

  const links = await db
    .select({
      annotationId: annotationPeople.annotationId,
      personId: people.id,
      displayName: people.displayName,
    })
    .from(annotationPeople)
    .innerJoin(people, eq(people.id, annotationPeople.personId))
    .where(
      inArray(
        annotationPeople.annotationId,
        rows.map((r) => r.id),
      ),
    );

  const byAnnotation = new Map<number, { id: number; displayName: string }[]>();
  for (const l of links) {
    const list = byAnnotation.get(l.annotationId) ?? [];
    list.push({ id: l.personId, displayName: l.displayName });
    byAnnotation.set(l.annotationId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    body: r.body,
    annotationType: r.annotationType,
    incorporatePref: r.incorporatePref,
    authorId: r.authorId,
    authorName:
      r.authorPersonName || localPart(r.authorEmail) || "A band member",
    createdOn: r.createdOn,
    modifiedOn: r.modifiedOn,
    people: byAnnotation.get(r.id) ?? [],
  }));
}

export async function getAnnotationById(
  db: Db,
  id: number,
): Promise<AnnotationDTO | null> {
  const row = await db
    .select({
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
    })
    .from(annotations)
    .leftJoin(users, eq(users.id, annotations.authorId))
    .leftJoin(people, eq(people.id, users.personId))
    .where(and(eq(annotations.id, id), eq(annotations.isDeleted, false)))
    .get();
  if (!row) return null;

  const links = await db
    .select({ personId: people.id, displayName: people.displayName })
    .from(annotationPeople)
    .innerJoin(people, eq(people.id, annotationPeople.personId))
    .where(eq(annotationPeople.annotationId, id));

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
    people: links.map((l) => ({ id: l.personId, displayName: l.displayName })),
  };
}

function localPart(email: string | null): string | null {
  if (!email) return null;
  return email.split("@")[0] ?? null;
}

// ---- People & Places --------------------------------------------------------

export async function listPeople(db: Db): Promise<PersonDTO[]> {
  const rows = await db
    .select()
    .from(people)
    .where(eq(people.isDeleted, false))
    .orderBy(people.displayName);
  return rows.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    aliases: p.aliases,
    bio: p.bio,
  }));
}

export async function getPerson(
  db: Db,
  id: number,
): Promise<PersonDTO | null> {
  const p = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.isDeleted, false)))
    .get();
  return p
    ? { id: p.id, displayName: p.displayName, aliases: p.aliases, bio: p.bio }
    : null;
}

export async function listPlaces(db: Db): Promise<PlaceDTO[]> {
  const rows = await db
    .select()
    .from(places)
    .where(eq(places.isDeleted, false))
    .orderBy(places.name);
  return rows.map(toPlaceDTO);
}

export async function getPlace(db: Db, id: number): Promise<PlaceDTO | null> {
  const p = await db
    .select()
    .from(places)
    .where(and(eq(places.id, id), eq(places.isDeleted, false)))
    .get();
  return p ? toPlaceDTO(p) : null;
}

function toPlaceDTO(p: typeof places.$inferSelect): PlaceDTO {
  return {
    id: p.id,
    name: p.name,
    placeType: p.placeType,
    address: p.address,
    status: p.status,
  };
}

// ---- Users & audit ----------------------------------------------------------

export async function listUsers(db: Db): Promise<UserDTO[]> {
  const rows = await db.select().from(users).orderBy(users.email);
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    personId: u.personId,
    isDeleted: u.isDeleted,
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

  return rows.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    targetType: r.targetType,
    action: r.action,
    beforeJson: r.beforeJson,
    afterJson: r.afterJson,
    changedBy: r.changedBy,
    changedByEmail: r.changedByEmail,
    changedAt: r.changedAt,
  }));
}
