import type { ReactNode } from "react";
import { Icon, type IconName } from "../ui/Icon";
import {
  confidenceLabel,
  eventDateTimeMetaLabel,
  eventTypeLabel,
} from "../../lib/format";
import type { Confidence } from "@shared/types";
import type { EventDetailDTO } from "@shared/dto";
import { Tag } from "../ui/Pill";
import styles from "./EventDetailView.module.css";

const CONFIDENCE_ICONS: Record<Confidence, IconName> = {
  high: "confidence-high",
  medium: "confidence-medium",
  low: "confidence-low",
};

interface EventHeroProps {
  event: EventDetailDTO;
}

export function EventHero({ event }: EventHeroProps) {
  const performers = event.people.filter(
    (person) => person.relationshipType === "performer",
  );

  return (
    <>
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
    </>
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
