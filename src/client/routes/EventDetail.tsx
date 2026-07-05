import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Container, Grid, SidebarLayout } from "../components/layout";
import { Tag } from "../components/ui/Pill";
import { SectionTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { MediaFrame } from "../components/media/MediaFrame";
import { MediaUpload } from "../components/media/MediaUpload";
import { MemoriesSection } from "../components/memory/MemoriesSection";
import { ErrorState, Spinner } from "../components/state";
import { useAuth } from "../lib/auth";
import { useAsync } from "../lib/useAsync";
import { apiFetch } from "../lib/api";
import { eventDateLabel } from "../lib/format";
import type { EventDetailDTO, MediaItemDTO } from "@shared/dto";
import styles from "./EventDetail.module.css";

export default function EventDetail() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync(
    () => apiFetch<EventDetailDTO>(`/api/events/${slug}`),
    [slug],
  );

  if (loading) {
    return (
      <Container>
        <Spinner label="Loading event" />
      </Container>
    );
  }
  if (error || !data) {
    return (
      <Container>
        <ErrorState
          title="Event not found"
          message={error?.message}
          onRetry={reload}
        />
      </Container>
    );
  }

  const event = data;

  return <EventDetailView event={event} onReload={reload} />;
}

function EventDetailView({
  event,
  onReload,
}: {
  event: EventDetailDTO;
  onReload: () => void;
}) {
  const { user, isEditor } = useAuth();
  const [mediaItems, setMediaItems] = useState<MediaItemDTO[]>(
    event.mediaItems,
  );

  const performers = event.people.filter(
    (p) => p.relationshipType === "performer",
  );
  const gallery = mediaItems.filter((m) => m.url && m.status === "published");
  const uniquePeople = Array.from(
    new Map(
      event.people.map((p) => [p.personId, { id: p.personId, displayName: p.displayName }]),
    ).values(),
  );

  return (
    <Container>
      <div
        className={styles.hero}
        style={
          event.heroImageUrl
            ? undefined
            : undefined /* placeholder handled below */
        }
      >
        {event.heroImageUrl ? (
          <img className={styles.heroImage} src={event.heroImageUrl} alt="" />
        ) : (
          <div className={styles.heroPlaceholder} />
        )}
        <div className={styles.heroScrim}>
          <span className={styles.eyebrow}>
            {event.eventType === "performance" ? "Performance" : event.eventType}
          </span>
          <h1 className={styles.title}>{event.title}</h1>
          <div className={styles.subtitle}>
            <Tag icon="calendar" iconLabel="Date">
              {eventDateLabel(event)}
            </Tag>
            {event.place && (
              <Tag icon="place" iconLabel="Place">
                {event.place.name}
              </Tag>
            )}
            {performers.length > 0 && (
              <Tag icon="people" iconLabel="Personnel">
                {performers.map((p) => p.displayName).join(", ")}
              </Tag>
            )}
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <SidebarLayout
          aside={
            <>
              {event.performance?.setlistText && (
                <div className={styles.sidebarCard}>
                  <SectionTitle>Setlist</SectionTitle>
                  <p className={styles.setlist}>
                    {event.performance.setlistText}
                  </p>
                </div>
              )}
              {event.acts.length > 0 && (
                <div className={styles.sidebarCard}>
                  <SectionTitle>Other acts on the bill</SectionTitle>
                  <div className={styles.actList}>
                    {event.acts.map((act) => (
                      <div key={act.id} className={styles.act}>
                        <span>{act.name}</span>
                        {act.billingRole !== "unknown" && (
                          <span className={styles.actRole}>{act.billingRole}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {event.people.length > 0 && (
                <div className={styles.sidebarCard}>
                  <SectionTitle>People</SectionTitle>
                  <div className={styles.peopleList}>
                    {event.people.map((p) => (
                      <Tag key={`${p.personId}-${p.relationshipType}`} icon="people">
                        {p.displayName}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
            </>
          }
        >
          {event.summary && (
            <section className={styles.section}>
              <p className={styles.summary}>{event.summary}</p>
            </section>
          )}

          <section className={styles.section}>
            <SectionTitle>Media</SectionTitle>
            {gallery.length > 0 ? (
              <Grid min={220}>
                {gallery.map((m) => (
                  <MediaFrame
                    key={m.id}
                    type={m.mediaType}
                    src={m.url ?? ""}
                    title={m.title}
                    caption={m.description}
                    poster={m.thumbUrl}
                  />
                ))}
              </Grid>
            ) : (
              <p className={styles.emptyMedia}>No media uploaded yet.</p>
            )}
            {user && (
              <MediaUpload
                eventId={event.id}
                onUploaded={(item) => {
                  setMediaItems((cur) => [item, ...cur]);
                  onReload();
                }}
              />
            )}
          </section>

          {isEditor && (
            <p className={styles.editLink}>
              <Link to={`/events/${event.slug}/edit`}>Edit this event</Link>
            </p>
          )}

          <div className={styles.section}>
            <MemoriesSection
              targetType="event"
              targetId={event.id}
              initial={event.annotations}
              people={uniquePeople}
            />
          </div>
        </SidebarLayout>

        {event.sources.length > 0 && (
          <section className={styles.section}>
            <SectionTitle>Sources</SectionTitle>
            <div className={styles.sources}>
              {event.sources.map((s) => (
                <div key={s.id} className={styles.source}>
                  <Icon
                    name={s.sourceType === "url" ? "link" : "document"}
                    size={16}
                  />
                  {s.url ? (
                    <a
                      className={styles.sourceLink}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.description || s.url}
                    </a>
                  ) : (
                    <span>{s.description}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Container>
  );
}
