import { useMemo, useState } from "react";
import { Container, Grid } from "../components/layout";
import layoutStyles from "../components/layout/layout.module.css";
import { PageHeader } from "../components/ui/PageHeader";
import { Select, TextField } from "../components/form";
import { EventCard } from "../components/cards/EventCard";
import { EmptyState, ErrorState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useFilterOptions } from "../lib/useFilterOptions";
import { eventTypeLabel } from "../lib/format";
import { listEvents } from "../lib/events";
import { EVENT_TYPES, type EventType } from "@shared/types";
import styles from "./Performances.module.css";

const NON_PERFORMANCE_TYPES = EVENT_TYPES.filter(
  (t): t is Exclude<EventType, "performance"> => t !== "performance",
);

export default function Events() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [place, setPlace] = useState("");
  const [person, setPerson] = useState("");
  const [eventType, setEventType] = useState("");

  const filters = useFilterOptions({ places: true, people: true });

  const query = useMemo(
    () => ({
      exclude_event_type: "performance" as const,
      q: debouncedSearch.trim() || undefined,
      place: place || undefined,
      person: person || undefined,
      event_type: (eventType || undefined) as EventType | undefined,
    }),
    [debouncedSearch, place, person, eventType],
  );

  const { data, error, loading, reload } = useAsync(
    () => listEvents(query),
    [query],
  );

  const events = data?.results ?? [];

  return (
    <Container>
      <PageHeader
        eyebrow="Off stage"
        title="Events"
        subtitle="Parties, reunions, recording sessions, rehearsals, and everything else that wasn't a performance."
      />

      <div className={layoutStyles.filterBar}>
        <TextField
          label="Search events"
          type="search"
          placeholder="Search by title or summary..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={layoutStyles.filterBarDropdowns}>
          <Select
            label="Event type"
            placeholder="All types"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            options={NON_PERFORMANCE_TYPES.map((t) => ({
              value: t,
              label: eventTypeLabel(t),
            }))}
          />
          <Select
            label="Venue"
            placeholder="All venues"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            options={filters.places.map((p) => ({
              value: String(p.id),
              label: p.name,
            }))}
          />
          <Select
            label="Personnel"
            placeholder="Anyone"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            options={filters.people.map((p) => ({
              value: String(p.id),
              label: p.displayName,
            }))}
          />
        </div>
      </div>

      {loading && <Spinner label="Loading events" />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && events.length === 0 && (
        <EmptyState title="No events match your filters" icon="calendar" />
      )}

      {!loading && !error && events.length > 0 && (
        <>
          <p className={styles.resultCount}>
            {events.length} {events.length === 1 ? "event" : "events"}
          </p>
          <Grid min={240}>
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </Grid>
        </>
      )}
    </Container>
  );
}
