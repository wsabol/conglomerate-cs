import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { eventDateLabel } from "../../lib/format";
import type { EventListItemDTO } from "@shared/dto";
import styles from "./cards.module.css";

export interface PerformanceCardProps {
  event: EventListItemDTO;
  showEventType?: boolean;
}

export function PerformanceCard({
  event,
  showEventType = true,
}: PerformanceCardProps) {
  const { slug, title, place, eventType, heroImageUrl, headlined, media } =
    event;

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
            <Icon name="star" size={12} /> Headlined
          </span>
        )}
        {(media.photo || media.video || media.audio || media.setlist) && (
          <div className={styles.indicators}>
            {media.photo && (
              <span className={styles.indicator}>
                <Icon name="photo" size={14} label="Has photos" />
              </span>
            )}
            {media.video && (
              <span className={styles.indicator}>
                <Icon name="video" size={14} label="Has video" />
              </span>
            )}
            {media.audio && (
              <span className={styles.indicator}>
                <Icon name="audio" size={14} label="Has audio" />
              </span>
            )}
            {media.setlist && (
              <span className={styles.indicator}>
                <Icon name="document" size={14} label="Has setlist" />
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.body}>
        <span className={styles.date}>{eventDateLabel(event)}</span>
        <span className={styles.title}>{title}</span>
        <div className={styles.meta}>
          {place && (
            <span className={styles.metaItem}>
              <Icon name="place" size={14} /> {place.name}
            </span>
          )}
          {showEventType && (
            <span className={styles.metaItem} style={{ textTransform: "capitalize" }}>
              {eventType}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
