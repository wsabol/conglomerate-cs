import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import styles from "./cards.module.css";

export interface MediaAvailability {
  photo?: boolean;
  video?: boolean;
  audio?: boolean;
  setlist?: boolean;
}

export interface PerformanceCardProps {
  slug: string;
  title: string;
  dateLabel: string;
  place?: string | null;
  eventType?: string;
  imageUrl?: string | null;
  featured?: boolean;
  media?: MediaAvailability;
}

export function PerformanceCard({
  slug,
  title,
  dateLabel,
  place,
  eventType,
  imageUrl,
  featured,
  media,
}: PerformanceCardProps) {
  return (
    <Link to={`/events/${slug}`} className={styles.card}>
      <div className={styles.media}>
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="mic" size={40} label="No image available" />
          </div>
        )}
        {featured && (
          <span className={styles.featured}>
            <Icon name="star" size={12} /> Featured
          </span>
        )}
        {media && (
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
        <span className={styles.date}>{dateLabel}</span>
        <span className={styles.title}>{title}</span>
        <div className={styles.meta}>
          {place && (
            <span className={styles.metaItem}>
              <Icon name="place" size={14} /> {place}
            </span>
          )}
          {eventType && (
            <span className={styles.metaItem} style={{ textTransform: "capitalize" }}>
              {eventType}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
