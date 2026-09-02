import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { MetaItem } from "../ui/MetaItem";
import { eventDateLabel, eventTypeLabel } from "../../lib/format";
import type { EventListItemDTO } from "@shared/dto";
import { MediaAvailabilityIndicators } from "./MediaAvailabilityIndicators";
import styles from "./cards.module.css";

export interface EventCardProps {
  event: EventListItemDTO;
}

export function EventCard({ event }: EventCardProps) {
  const { slug, title, place, eventType, heroImageUrl, media } = event;

  return (
    <Link to={`/events/${slug}`} className={styles.card}>
      <div className={styles.media}>
        {heroImageUrl ? (
          <img src={heroImageUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="calendar" size={40} label="No image available" />
          </div>
        )}
        <div className={styles.mediaOverlay} aria-hidden="true" />
        <MediaAvailabilityIndicators media={media} variant="overlay" />
      </div>
      <div className={styles.body}>
        <span className={styles.date}>{eventDateLabel(event)}</span>
        <span className={styles.title}>{title}</span>
        <div className={styles.meta}>
          <MetaItem icon="info" iconLabel="Event type">
            {eventTypeLabel(eventType)}
          </MetaItem>
          {place && (
            <MetaItem icon="place" iconLabel="Place">
              {place.name}
            </MetaItem>
          )}
        </div>
      </div>
    </Link>
  );
}
