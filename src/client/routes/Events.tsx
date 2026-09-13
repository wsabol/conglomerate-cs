import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Container, Grid } from "../components/layout";
import layoutStyles from "../components/layout/layout.module.css";
import { PageHeader } from "../components/ui/PageHeader";
import { buttonClass } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Select, TextField } from "../components/form";
import { EventCard } from "../components/cards/EventCard";
import { EmptyState, ErrorState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useFilterOptions } from "../lib/useFilterOptions";
import { listEvents } from "../lib/events";
import { eventTypeLabel } from "../lib/format";
import { useAuth } from "../lib/auth";
import {
  NON_PERFORMANCE_EVENT_TYPES,
  type EventType,
} from "@shared/types";
import styles from "./Performances.module.css";

export default function Events() {
  const { isEditor } = useAuth();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [eventType, setEventType] = useState("");
  const [place, setPlace] = useState("");
  const [person, setPerson] = useState("");
  const filters = useFilterOptions({ places: true, people: true });

  const query = useMemo(
    () => ({
      event_group: "non_performance" as const,
      event_type: (eventType || undefined) as EventType | undefined,
      q: debouncedSearch.trim() || undefined,
      place: place || undefined,
      person: person || undefined,
      sort: "date" as const,
    }),
    [debouncedSearch, eventType, place, person],
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
        subtitle="Reunions, parties, rehearsals, recording sessions, and everything in between."
        actions={
          isEditor ? (
            <Link to="/events/new" className={buttonClass("primary")}>
              <Icon name="plus" size={16} /> Add event
            </Link>
          ) : undefined
        }
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
            options={NON_PERFORMANCE_EVENT_TYPES.map((type) => ({
              value: type,
              label: eventTypeLabel(type),
            }))}
          />
          <Select
            label="Place"
            placeholder="All places"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            options={filters.places.map((item) => ({
              value: String(item.id),
              label: item.name,
            }))}
          />
          <Select
            label="Personnel"
            placeholder="Anyone"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            options={filters.people.map((item) => ({
              value: String(item.id),
              label: item.displayName,
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
