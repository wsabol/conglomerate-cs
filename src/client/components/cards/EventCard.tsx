import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { MetaItem } from "../ui/MetaItem";
import { eventDateLabel, eventTypeLabel } from "../../lib/format";
import type { EventListItemDTO } from "@shared/dto";
import { MediaAvailabilityIndicators } from "./MediaAvailabilityIndicators";
import styles from "./cards.module.css";

export function EventCard({ event }: { event: EventListItemDTO }) {
  return (
    <Link to={`/events/${event.slug}`} className={styles.card}>
      <div className={styles.media}>
        {event.heroImageUrl ? (
          <img src={event.heroImageUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="calendar" size={40} label="No image available" />
          </div>
        )}
        <div className={styles.mediaOverlay} aria-hidden="true" />
        <span className={styles.eventTypeBadge}>
          {eventTypeLabel(event.eventType)}
        </span>
        <MediaAvailabilityIndicators media={event.media} variant="overlay" />
      </div>
      <div className={styles.body}>
        <span className={styles.date}>{eventDateLabel(event)}</span>
        <span className={styles.title}>{event.title}</span>
        <div className={styles.meta}>
          {event.place && (
            <MetaItem icon="place" iconLabel="Place">
              {event.place.name}
            </MetaItem>
          )}
        </div>
      </div>
    </Link>
  );
}
