import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Container, Grid, SidebarLayout } from "../layout";
import { SectionTitle } from "../ui/Card";
import { Icon, type IconName } from "../ui/Icon";
import { MediaFrame } from "../media/MediaFrame";
import { MediaUpload } from "../media/MediaUpload";
import { MemoriesSection } from "../memory/MemoriesSection";
import { useAuth } from "../../lib/auth";
import {
  confidenceLabel,
  eventDateOnlyLabel,
  eventDateTimeMetaLabel,
  eventTypeLabel,
} from "../../lib/format";
import type { Confidence } from "@shared/types";
import type { EventDetailDTO, MediaItemDTO } from "@shared/dto";
import { EventPosterCard } from "./EventPosterCard";
import { OtherActsSection } from "./OtherActsSection";
import { SetlistSection } from "./SetlistSection";
import { SourcesSection } from "./SourcesSection";
import styles from "./EventDetailView.module.css";
import { EmptyState } from "../state";
import { cn } from "@client/lib/cn";
import { Button } from "../ui/Button";
import { Tag } from "../ui/Pill";

type DetailTab = "summary" | "description" | "sources";

const CONFIDENCE_ICONS: Record<Confidence, IconName> = {
  high: "confidence-high",
  medium: "confidence-medium",
  low: "confidence-low",
};

const TABS: { id: DetailTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "description", label: "Event Promo" },
  { id: "sources", label: "Sources" },
];

const DETAIL_TAB_IDS = new Set<DetailTab>(TABS.map(({ id }) => id));

function tabFromHash(hash: string): DetailTab {
  const id = hash.replace(/^#/, "") as DetailTab;
  return DETAIL_TAB_IDS.has(id) ? id : "summary";
}

interface EventDetailViewProps {
  event: EventDetailDTO;
  onReload: () => void;
}

export function EventDetailView({ event, onReload }: EventDetailViewProps) {
  const { user, isEditor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromHash(location.hash);
  const [mediaItems, setMediaItems] = useState<MediaItemDTO[]>(
    event.mediaItems,
  );

  function selectTab(id: DetailTab) {
    navigate({ hash: id }, { replace: true });
  }

  const performers = event.people.filter(
    (person) => person.relationshipType === "performer",
  );
  const gallery = mediaItems.filter(
    (item) => item.url && item.status === "published",
  );
  const uniquePeople = Array.from(
    new Map(
      event.people.map((person) => [
        person.personId,
        { id: person.personId, displayName: person.displayName },
      ]),
    ).values(),
  );
  const promotionText = event.performance?.promotionText;
  const billingName = event.performance?.billingName;

  return (
    <Container>
      <div className={styles.hero}>
        {event.heroImageUrl ? (
          <img className={styles.heroImage} src={event.heroImageUrl} alt="" />
        ) : (
          <div className={styles.heroPlaceholder} />
        )}
        <div className={styles.heroOverlay} />
      </div>

      <header className={styles.header}>
        <span className={styles.eyebrow}>{eventTypeLabel(event.eventType)}</span>
        <h1 className={styles.title}>{event.title}</h1>
        <div className={styles.meta}>
          <Tag icon="calendar" iconLabel="Date">
            {eventDateTimeMetaLabel(event)}
          </Tag>
          {event.place && (
            <Tag icon="place" iconLabel="Place">
              {event.place.name}
            </Tag>
          )}
          {performers.length > 0 && (
            <Tag icon="people" iconLabel="Personnel">
              {performers.map((person) => person.displayName).join(", ")}
            </Tag>
          )}
          {event.headlined && <Tag icon="star" iconLabel="Headliner" />}
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
              <OtherActsSection
                event={event}
                isEditor={isEditor}
                onReload={onReload}
              />
              <EventPosterCard event={event} onReload={onReload} />
              <SetlistSection
                event={event}
                isEditor={isEditor}
                onReload={onReload}
              />
            </>
          }
        >
          <div
            className={styles.tabList}
            role="tablist"
            aria-label="Event details"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={styles.tab}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            ))}
            {isEditor && (
              <Link to={`/events/${event.slug}/edit`} className={cn(styles.tab, styles.editTab)}>
                <Button type="button" variant="ghost-primary" size="sm" className={styles.editButton}>
                  <Icon name="edit" size={14} /> Edit event
                </Button>
              </Link>
            )}
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
                <EmptyState title="No summary yet." icon="document" size="sm"></EmptyState>
              )}

              <div className={styles.memories}>
                <MemoriesSection
                  targetType="event"
                  targetId={event.id}
                  initial={event.annotations}
                  people={uniquePeople}
                  contextLabel={`${eventDateOnlyLabel(event)} · ${event.title}`}
                />
              </div>

              <section className={styles.mediaSection}>
                <SectionTitle>Media</SectionTitle>
                {gallery.length > 0 ? (
                  <Grid min={220}>
                    {gallery.map((item) => (
                      <MediaFrame
                        key={item.id}
                        type={item.mediaType}
                        src={item.url ?? ""}
                        title={item.title}
                        caption={item.description}
                        poster={item.thumbUrl}
                      />
                    ))}
                  </Grid>
                ) : (
                  <EmptyState title="No media yet." icon="photo" size="sm"></EmptyState>
                )}
                {user && (
                  <MediaUpload
                    eventId={event.id}
                    onUploaded={(item) => {
                      setMediaItems((current) => [item, ...current]);
                      onReload();
                    }}
                  />
                )}
              </section>
            </div>
          )}

          {tab === "description" && (
            <div
              role="tabpanel"
              id="panel-description"
              aria-labelledby="tab-description"
              className={styles.tabPanel}
            >
              {billingName && billingName !== event.title && <h4 className={styles.eventPromoHeading}>{billingName}</h4>}

              {promotionText ? (
                <p className={styles.description}>{promotionText}</p>
              ) : (
                <EmptyState title="No event promo." icon="link" size="sm"></EmptyState>
              )}

              <hr style={{ marginTop: 'var(--space-6)' }} />

              <p className={styles.sectionInfoFooter}>
                <Icon name="info" size={16} />
                Text from the original promotional material for the event.
              </p>
            </div>
          )}

          {tab === "sources" && (
            <div
              role="tabpanel"
              id="panel-sources"
              aria-labelledby="tab-sources"
              className={styles.tabPanel}
            >
              <SourcesSection
                event={event}
                isEditor={isEditor}
                onReload={onReload}
                contextLabel={`${eventDateOnlyLabel(event)} · ${event.title}`}
              />
            </div>
          )}
        </SidebarLayout>
      </div>
    </Container>
  );
}

function MetaItem({
  icon,
  iconLabel,
  children,
  tone = "default",
}: {
  icon: IconName;
  iconLabel: string;
  children?: ReactNode;
  tone?: Confidence | "default";
}) {
  children = children ?? iconLabel;
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
