import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { MetaItem } from "../ui/MetaItem";
import { eventDateLabel } from "../../lib/format";
import type { EventListItemDTO } from "@shared/dto";
import { MediaAvailabilityIndicators } from "./MediaAvailabilityIndicators";
import styles from "./cards.module.css";

export interface PerformanceCardProps {
  event: EventListItemDTO;
}

export function PerformanceCard({event}: PerformanceCardProps) {
  const { slug, title, place, eventType, heroImageUrl, headlined, media } = event;
  if (eventType !== "performance") {
    return null;
  }

  return (
    <Link to={`/events/${slug}`} className={styles.card}>
      <div className={styles.media}>
        {heroImageUrl ? (
          <img src={heroImageUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="mic" size={40} label="No image available" />
          </div>
        )}
        {headlined && (
          <span className={styles.headlined}>
            <Icon name="star" size={12} /> Headliner
          </span>
        )}
        <MediaAvailabilityIndicators media={media} variant="overlay" />
      </div>
      <div className={styles.body}>
        <span className={styles.date}>{eventDateLabel(event)}</span>
        <span className={styles.title}>{title}</span>
        <div className={styles.meta}>
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
