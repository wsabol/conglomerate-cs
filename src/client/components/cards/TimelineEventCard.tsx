import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { cn } from "../../lib/cn";
import type { MediaAvailabilityDTO } from "@shared/dto";
import type { Confidence } from "@shared/types";
import { MediaAvailabilityIndicators } from "./MediaAvailabilityIndicators";
import styles from "./TimelineEventCard.module.css";

export interface TimelineEventCardProps {
  slug: string;
  title: string;
  dateLabel: string;
  timeLabel?: string | null;
  place?: string | null;
  eventTypeLabel: string;
  confidence: Confidence;
  confidenceLabel: string;
  media: MediaAvailabilityDTO;
}

export function TimelineEventCard({
  slug,
  title,
  dateLabel,
  timeLabel,
  place,
  eventTypeLabel,
  confidence,
  confidenceLabel,
  media,
}: TimelineEventCardProps) {
  return (
    <Link to={`/events/${slug}`} className={styles.card}>
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
          
          <span className={cn(styles.confidence, styles[confidence])}>
            <span className={styles.dot} aria-hidden />
            {confidenceLabel}
          </span>

          <MediaAvailabilityIndicators
            media={media}
            variant="inline"
            types={["video", "audio"]}
          />
        </div>
        <Icon name="chevron-right" size={18} className={styles.chevron} />
      </div>
    </Link>
  );
}
