// Data-transfer shapes returned by the API and consumed by the client.
import type {
  AnnotationType,
  BillingRole,
  Confidence,
  DatePrecision,
  EventType,
  IncorporatePref,
  MediaStatus,
  MediaType,
  PlaceStatus,
  RelationshipType,
  SourceType,
} from "./types";

export interface ArchiveStatsDTO {
  performanceCount: number;
  yearsActive: { start: number; end: number };
  venueCount: number;
  actCount: number;
}

export interface PlaceDTO {
  id: number;
  name: string;
  placeType: string | null;
  address: string | null;
  status: PlaceStatus;
}

export interface PersonDTO {
  id: number;
  displayName: string;
  aliases: string | null;
  bio: string | null;
}

export interface MediaAvailabilityDTO {
  photo: boolean;
  video: boolean;
  audio: boolean;
  setlist: boolean;
}

export interface EventListItemDTO {
  id: number;
  slug: string;
  name: string;
  title: string; // billing_name when present, else name
  eventType: EventType;
  eventDate: string | null;
  eventTime: string | null;
  datePrecision: DatePrecision;
  confidence: Confidence;
  place: { id: number; name: string } | null;
  heroImageId: number | null;
  heroImageUrl: string | null;
  media: MediaAvailabilityDTO;
  headlined: boolean;
}

export interface EventPersonDTO {
  personId: number;
  displayName: string;
  relationshipType: RelationshipType;
  notes: string | null;
}

export interface EventActDTO {
  id: number;
  name: string;
  billingRole: BillingRole;
}

export interface EventSourceDTO {
  id: number;
  sourceType: SourceType;
  description: string | null;
  url: string | null;
  mediaId: number | null;
  mediaUrl: string | null;
  thumbUrl: string | null;
}

export interface MediaItemDTO {
  id: number;
  title: string | null;
  mediaType: MediaType;
  status: MediaStatus;
  capturedDate: string | null;
  datePrecision: DatePrecision;
  description: string | null;
  eventId: number | null;
  eventSlug: string | null;
  eventTitle: string | null;
  provenance: string | null;
  url: string | null; // authenticated delivery URL (/media/:id)
  thumbUrl: string | null;
  people: { id: number; displayName: string }[];
}

export interface UserDTO {
  id: number;
  email: string;
  role: "member" | "editor";
  personId: number | null;
  isDeleted: boolean;
}

export interface InviteDTO {
  id: number;
  email: string;
  inviteeName: string;
  invitedByEmail: string;
  status: "pending" | "sent" | "failed";
  createdOn: string;
}

export interface InviteVerifyDTO {
  valid: true;
  inviteeName: string;
}

export interface RevisionDTO {
  id: number;
  targetId: number;
  targetType: string;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  changedBy: number | null;
  changedByEmail: string | null;
  changedAt: string;
}

export interface AnnotationDTO {
  id: number;
  targetType: "event" | "media";
  targetId: number;
  body: string;
  annotationType: AnnotationType;
  incorporatePref: IncorporatePref;
  authorId: number | null;
  authorName: string;
  createdOn: string;
  modifiedOn: string;
  people: { id: number; displayName: string }[];
}

export interface PerformanceDetailsDTO {
  billingName: string | null;
  promotionText: string | null;
  setlistText: string | null;
  eventPosterId: number | null;
  eventPosterUrl: string | null;
}

export interface EventDetailDTO extends EventListItemDTO {
  summary: string | null;
  placeDetail: PlaceDTO | null;
  performance: PerformanceDetailsDTO | null;
  people: EventPersonDTO[];
  acts: EventActDTO[];
  sources: EventSourceDTO[];
  mediaItems: MediaItemDTO[];
  annotations: AnnotationDTO[];
}

export interface EventSchemaDTO {
  id: number;
  slug: string;
  name: string;
  title: string; // billing_name when present, else name
  eventType: EventType;
  eventDate: string | null;
  eventTime: string | null;
  datePrecision: DatePrecision;
  confidence: Confidence;
  place: { id: number; name: string } | null;
  heroImageId: number | null;
  heroImageUrl: string | null;
  summary: string | null;
  performance: PerformanceDetailsDTO | null;
  people: EventPersonDTO[];
  acts: EventActDTO[];
  sources: EventSourceDTO[];
  mediaItems: MediaItemDTO[];
  annotations: AnnotationDTO[];
}
