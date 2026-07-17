import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { cn } from "../../lib/cn";
import type { MediaAvailabilityDTO } from "@shared/dto";
import { MediaAvailabilityIndicators } from "./MediaAvailabilityIndicators";
import styles from "./TimelineEventCard.module.css";

export interface TimelineEventCardProps {
  slug: string;
  title: string;
  dateLabel: string;
  timeLabel?: string | null;
  place?: string | null;
  eventTypeLabel: string;
  heroImageUrl?: string | null;
  media: MediaAvailabilityDTO;
}

export function TimelineEventCard({
  slug,
  title,
  dateLabel,
  timeLabel,
  place,
  eventTypeLabel,
  heroImageUrl,
  media,
}: TimelineEventCardProps) {
  return (
    <Link to={`/events/${slug}`} className={cn(styles.card, heroImageUrl && styles.hasHeroImage)}>
      {heroImageUrl && (
        <div className={styles.thumbnail}>
          <img src={heroImageUrl} alt={title} loading="lazy"  />
        </div>
      )}
      {/* <div className={styles.thumbnail}>
        {heroImageUrl ? (
          <img src={heroImageUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.thumbnailPlaceholder}>
            <Icon name="mic" size={20} label="No image available" />
          </div>
        )}
      </div> */}
      <div className={styles.cardBody}>
        <div className={styles.main}>
          <span className={styles.date}>{dateLabel}</span>
          <span className={styles.title}>{title}</span>
          {(place || timeLabel) && (
            <div className={styles.details}>
              {place && (
                <span className={styles.detailItem}>
                  <Icon name="place" size={14} /> {place}
                </span>
              )}
              {timeLabel && (
                <span className={styles.detailItem}>
                  <Icon name="clock" size={14} /> {timeLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div className={styles.aside}>
          <div className={styles.asideMeta}>
            <span className={styles.eventType}>{eventTypeLabel}</span>

            <MediaAvailabilityIndicators
              media={media}
              variant="inline"
            />
          </div>
          <Icon name="chevron-right" size={18} className={styles.chevron} />
        </div>
      </div>
    </Link>
  );
}
