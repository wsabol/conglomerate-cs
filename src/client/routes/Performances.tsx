import { useMemo, useState } from "react";
import { Container, Grid } from "../components/layout";
import { PageHeader } from "../components/ui/PageHeader";
import { Select, TextField } from "../components/form";
import { PerformanceCard } from "../components/cards/PerformanceCard";
import { EmptyState, ErrorState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useFilterOptions } from "../lib/useFilterOptions";
import { listEvents } from "../lib/events";
import type { BillingRole } from "@shared/types";
import styles from "./Performances.module.css";

export default function Performances() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [place, setPlace] = useState("");
  const [person, setPerson] = useState("");
  const [lineup, setLineup] = useState("");

  const filters = useFilterOptions({ places: true, people: true });

  const query = useMemo(
    () => ({
      event_type: "performance" as const,
      q: debouncedSearch.trim() || undefined,
      place: place || undefined,
      person: person || undefined,
      lineup: (lineup || undefined) as BillingRole | undefined,
    }),
    [debouncedSearch, place, person, lineup],
  );

  const { data, error, loading, reload } = useAsync(
    () => listEvents(query),
    [query],
  );

  const events = data?.results ?? [];

  return (
    <Container>
      <PageHeader
        eyebrow="On stage"
        title="Performances"
        subtitle="Every show we can account for, with the media and memories attached."
      />

      <div className={styles.filters}>
        <TextField
          label="Search performances"
          type="search"
          placeholder="Search by title or summary..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.dropdowns}>
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
          <Select
            label="Lineup"
            placeholder="Any lineup"
            value={lineup}
            onChange={(e) => setLineup(e.target.value)}
            options={[
              { value: "headliner", label: "Headliner" },
              { value: "opener", label: "Opener" },
            ]}
          />
        </div>
      </div>

      {loading && <Spinner label="Loading performances" />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && events.length === 0 && (
        <EmptyState title="No performances match your filters" icon="mic" />
      )}

      {!loading && !error && events.length > 0 && (
        <>
          <p className={styles.resultCount}>
            {events.length} {events.length === 1 ? "performance" : "performances"}
          </p>
          <Grid min={240}>
            {events.map((event) => (
              <PerformanceCard key={event.id} event={event} showEventType={false} />
            ))}
          </Grid>
        </>
      )}
    </Container>
  );
}
