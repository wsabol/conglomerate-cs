import { Link } from "react-router-dom";
import { Container, Grid } from "../components/layout";
import layoutStyles from "../components/layout/layout.module.css";
import { PageHeader } from "../components/ui/PageHeader";
import { MediaFrame } from "../components/media/MediaFrame";
import { Pill } from "../components/ui/Pill";
import { Select } from "../components/form";
import { EmptyState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { useFilterOptions } from "../lib/useFilterOptions";
import { listMedia } from "../lib/media";
import { eventDateLabel } from "../lib/format";
import type { MediaType } from "@shared/types";
import { useMemo, useState } from "react";
import styles from "./Media.module.css";

export default function Media() {
  const [mediaType, setMediaType] = useState<MediaType | "">("");
  const [year, setYear] = useState("");
  const [person, setPerson] = useState("");

  const { data, loading, error } = useAsync(
    () =>
      listMedia({
        media_type: mediaType || undefined,
        year: year || undefined,
        person: person || undefined,
      }),
    [mediaType, year, person],
  );

  const { people } = useFilterOptions({ people: true });

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const m of data?.results ?? []) {
      if (m.capturedDate) set.add(Number(m.capturedDate.slice(0, 4)));
    }
    return [...set].sort((a, b) => b - a);
  }, [data]);

  const items = data?.results ?? [];

  return (
    <Container>
      <PageHeader
        eyebrow="Discovery"
        title="Media"
        subtitle="Browse every photo, video, and recording across the archive."
      />

      <div className={layoutStyles.filterBarInline}>
        <Pill
          active={mediaType === "photo"}
          onClick={() => setMediaType(mediaType === "photo" ? "" : "photo")}
        >
          Photos
        </Pill>
        <Pill
          active={mediaType === "video"}
          onClick={() => setMediaType(mediaType === "video" ? "" : "video")}
        >
          Videos
        </Pill>
        <Pill
          active={mediaType === "audio"}
          onClick={() => setMediaType(mediaType === "audio" ? "" : "audio")}
        >
          Audio
        </Pill>
        <Select
          label="Year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          options={[
            { value: "", label: "Any year" },
            ...years.map((y) => ({ value: String(y), label: String(y) })),
          ]}
        />
        <Select
          label="Person"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          options={[
            { value: "", label: "Anyone" },
            ...(people.map((p) => ({
              value: String(p.id),
              label: p.displayName,
            }))),
          ]}
        />
      </div>

      {loading ? (
        <Spinner label="Loading media" />
      ) : error ? (
        <EmptyState title="Could not load media" icon="photo">
          {error.message}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState title="No media yet" icon="photo">
          Upload files from an event page to populate the archive.
        </EmptyState>
      ) : (
        <Grid min={240}>
          {items.map((m) => (
            <article key={m.id} className={styles.card}>
              <MediaFrame
                type={m.mediaType}
                src={m.url ?? ""}
                title={m.title}
                caption={m.description}
                poster={m.thumbUrl}
                playable={m.playable}
              />
              {m.eventSlug && (
                <Link className={styles.eventLink} to={`/events/${m.eventSlug}`}>
                  {m.eventTitle ?? "View event"}
                </Link>
              )}
              {m.capturedDate && (
                <span className={styles.meta}>
                  {eventDateLabel({
                    eventDate: m.capturedDate,
                    eventTime: null,
                    datePrecision: m.datePrecision,
                  })}
                </span>
              )}
            </article>
          ))}
        </Grid>
      )}
    </Container>
  );
}
