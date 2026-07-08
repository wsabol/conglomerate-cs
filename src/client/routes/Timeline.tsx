import { useMemo, useState } from "react";
import { Container } from "../components/layout";
import { PageHeader } from "../components/ui/PageHeader";
import { Pill } from "../components/ui/Pill";
import { TimelineEventCard } from "../components/cards/TimelineEventCard";
import { EmptyState, ErrorState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { listEvents } from "../lib/events";
import {
  confidenceLabel,
  eventDateOnlyLabel,
  eventTimeLabel,
  eventTypeLabel,
  yearOf,
} from "../lib/format";
import type { EventListItemDTO } from "@shared/dto";
import styles from "./Timeline.module.css";

export default function Timeline() {
  const { data, error, loading, reload } = useAsync(
    () => listEvents({ sort: "date" }),
    [],
  );
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const groups = useMemo(() => {
    const events = data?.results ?? [];
    const byYear = new Map<string, EventListItemDTO[]>();
    for (const e of events) {
      const year = yearOf(e.eventDate);
      const list = byYear.get(year) ?? [];
      list.push(e);
      byYear.set(year, list);
    }
    return [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  const years = groups.map(([year]) => year);
  const visible = selectedYear
    ? groups.filter(([year]) => year === selectedYear)
    : groups;

  return (
    <Container>
      <PageHeader
        eyebrow="Archive"
        title="Timeline"
        subtitle="A chronological account of everything that happened - most recent first."
      />

      {!loading && !error && years.length > 0 && (
        <div className={styles.controls}>
          <Pill active={selectedYear === null} onClick={() => setSelectedYear(null)}>
            All years
          </Pill>
          {years.map((year) => (
            <Pill
              key={year}
              active={selectedYear === year}
              onClick={() =>
                setSelectedYear((cur) => (cur === year ? null : year))
              }
            >
              {year}
            </Pill>
          ))}
        </div>
      )}

      {loading && <Spinner label="Loading the timeline" />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && groups.length === 0 && (
        <EmptyState title="The timeline is empty" icon="calendar" />
      )}

      {visible.length > 0 && (
        <div className={styles.timeline}>
          {visible.map(([year, events]) => (
            <section key={year} className={styles.yearGroup}>
              <div className={styles.yearHeading}>
                <span className={styles.marker} aria-hidden />
                <span className={styles.year}>{year}</span>
                <span className={styles.count}>
                  {events.length} {events.length === 1 ? "event" : "events"}
                </span>
              </div>
              <div className={styles.events}>
                {events.map((e) => (
                  <TimelineEventCard
                    key={e.id}
                    slug={e.slug}
                    title={e.title}
                    dateLabel={eventDateOnlyLabel(e)}
                    timeLabel={
                      e.datePrecision === "exact" ? eventTimeLabel(e.eventTime) : null
                    }
                    place={e.place?.name}
                    eventTypeLabel={eventTypeLabel(e.eventType)}
                    confidence={e.confidence}
                    confidenceLabel={confidenceLabel(e.confidence)}
                    heroImageUrl={e.heroImageUrl}
                    media={e.media}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}
