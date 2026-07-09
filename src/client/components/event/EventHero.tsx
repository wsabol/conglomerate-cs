import {
  eventDateTimeMetaLabel,
  eventTypeLabel,
} from "../../lib/format";
import type { EventDetailDTO } from "@shared/dto";
import { Container } from "../layout";
import { Tag } from "../ui/Pill";
import styles from "./EventDetailView.module.css";

interface EventHeroProps {
  event: EventDetailDTO;
}

export function EventHero({ event }: EventHeroProps) {
  const performers = event.people.filter(
    (person) => person.relationshipType === "performer",
  );

  return (
    <>
      <section className={styles.heroBanner}>
        {event.heroImageUrl ? (
          <img className={styles.heroImage} src={event.heroImageUrl} alt="" />
        ) : (
          <div className={styles.heroPlaceholder} />
        )}
        <div className={styles.heroOverlay} />
      </section>

      <Container>
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
          </div>
        </header>
      </Container>
    </>
  );
}
