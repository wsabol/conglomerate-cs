import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Container, Grid, SidebarLayout } from "../components/layout";
import { SectionTitle } from "../components/ui/Card";
import { Icon, type IconName } from "../components/ui/Icon";
import { MediaFrame } from "../components/media/MediaFrame";
import { MediaUpload } from "../components/media/MediaUpload";
import { MemoriesSection } from "../components/memory/MemoriesSection";
import { ErrorState, Spinner } from "../components/state";
import { useAuth } from "../lib/auth";
import { useAsync } from "../lib/useAsync";
import { apiFetch } from "../lib/api";
import {
  confidenceLabel,
  eventDateTimeMetaLabel,
  eventTypeLabel,
} from "../lib/format";
import type { Confidence } from "@shared/types";
import type { EventDetailDTO, MediaItemDTO } from "@shared/dto";
import styles from "./EventDetail.module.css";

type DetailTab = "summary" | "description" | "sources";

const CONFIDENCE_ICONS: Record<Confidence, IconName> = {
  high: "confidence-high",
  medium: "confidence-medium",
  low: "confidence-low",
};

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

function MetaItem({
  icon,
  iconLabel,
  children,
  tone = "default",
}: {
  icon: IconName;
  iconLabel: string;
  children: ReactNode;
  tone?: Confidence | "default";
}) {
  return (
    <span
      className={styles.metaItem}
      data-tone={tone === "default" ? undefined : tone}
    >
      <Icon name={icon} size={14} label={iconLabel} className={styles.metaIcon} />
      {children}
    </span>
  );
}

function EventDetailView({
  event,
  onReload,
}: {
  event: EventDetailDTO;
  onReload: () => void;
}) {
  const { user, isEditor } = useAuth();
  const [tab, setTab] = useState<DetailTab>("summary");
  const [mediaItems, setMediaItems] = useState<MediaItemDTO[]>(
    event.mediaItems,
  );

  const performers = event.people.filter(
    (p) => p.relationshipType === "performer",
  );
  const gallery = mediaItems.filter((m) => m.url && m.status === "published");
  const uniquePeople = Array.from(
    new Map(
      event.people.map((p) => [
        p.personId,
        { id: p.personId, displayName: p.displayName },
      ]),
    ).values(),
  );
  const onTheBill = [
    ...performers.map((p) => p.displayName),
    ...event.acts.map((a) => a.name),
  ];
  const setlistLines =
    event.performance?.setlistText
      ?.split("\n")
      .map((line) => line.trim())
      .filter(Boolean) ?? [];
  const promotionText = event.performance?.promotionText;

  return (
    <Container>
      <div className={styles.hero}>
        {event.heroImageUrl ? (
          <img className={styles.heroImage} src={event.heroImageUrl} alt="" />
        ) : (
          <div className={styles.heroPlaceholder} />
        )}
        <div className={styles.heroOverlay}></div>
      </div>

      <header className={styles.header}>
        <span className={styles.eyebrow}>{eventTypeLabel(event.eventType)}</span>
        <h1 className={styles.title}>{event.title}</h1>
        <div className={styles.meta}>
          <MetaItem icon="calendar" iconLabel="Date">
            {eventDateTimeMetaLabel(event)}
          </MetaItem>
          {event.place && (
            <MetaItem icon="place" iconLabel="Place">
              {event.place.name}
            </MetaItem>
          )}
          {performers.length > 0 && (
            <MetaItem icon="people" iconLabel="Headliner">
              {performers.map((p) => p.displayName).join(", ")}
            </MetaItem>
          )}
          <MetaItem
            icon={CONFIDENCE_ICONS[event.confidence]}
            iconLabel="Confidence"
            tone={event.confidence}
          >
            {confidenceLabel(event.confidence)}
          </MetaItem>
        </div>
      </header>

      <div className={styles.content}>
        <SidebarLayout
          aside={
            <>
              {onTheBill.length > 0 && (
                <div className={styles.sidebarCard}>
                  <SectionTitle>On the bill</SectionTitle>
                  <ul className={styles.billList}>
                    {onTheBill.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
              {setlistLines.length > 0 && (
                <div className={styles.sidebarCard}>
                  <SectionTitle>Setlist</SectionTitle>
                  <ul className={styles.billList}>
                    {setlistLines.map((song) => (
                      <li key={song}>{song}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          }
        >
          <div
            className={styles.tabList}
            role="tablist"
            aria-label="Event details"
          >
            {(
              [
                ["summary", "Summary"],
                ["description", "Event Description"],
                ["sources", "Sources"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={styles.tab}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "summary" && (
            <div
              role="tabpanel"
              id="panel-summary"
              aria-labelledby="tab-summary"
              className={styles.tabPanel}
            >
              {event.summary ? (
                <p className={styles.summary}>{event.summary}</p>
              ) : (
                <p className={styles.emptyPanel}>No summary yet.</p>
              )}

              <div className={styles.memories}>
                <MemoriesSection
                  targetType="event"
                  targetId={event.id}
                  initial={event.annotations}
                  people={uniquePeople}
                />
              </div>
            </div>
          )}

          {tab === "description" && (
            <div
              role="tabpanel"
              id="panel-description"
              aria-labelledby="tab-description"
              className={styles.tabPanel}
            >
              {promotionText ? (
                <p className={styles.description}>{promotionText}</p>
              ) : (
                <p className={styles.emptyPanel}>No event description yet.</p>
              )}

              <section className={styles.mediaSection}>
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
            </div>
          )}

          {tab === "sources" && (
            <div
              role="tabpanel"
              id="panel-sources"
              aria-labelledby="tab-sources"
              className={styles.tabPanel}
            >
              {event.sources.length > 0 ? (
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
              ) : (
                <p className={styles.emptyPanel}>No sources recorded yet.</p>
              )}
            </div>
          )}

          {isEditor && (
            <p className={styles.editLink}>
              <Link to={`/events/${event.slug}/edit`}>Edit this event</Link>
            </p>
          )}
        </SidebarLayout>
      </div>
    </Container>
  );
}
