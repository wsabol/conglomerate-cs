import { Container, Grid } from "../components/layout";
import layoutStyles from "../components/layout/layout.module.css";
import { PageHeader } from "../components/ui/PageHeader";
import { MediaFrame } from "../components/media/MediaFrame";
import { MediaDetailView } from "../components/media/MediaDetailView";
import { Pill } from "../components/ui/Pill";
import { Select } from "../components/form";
import { EmptyState, Spinner } from "../components/state";
import { useAsync } from "../lib/useAsync";
import { useFilterOptions } from "../lib/useFilterOptions";
import { listMedia } from "../lib/media";
import type { MediaType } from "@shared/types";
import type { MediaItemDTO } from "@shared/dto";
import { useEffect, useMemo, useState } from "react";
import styles from "./Media.module.css";

export default function Media() {
  const [mediaType, setMediaType] = useState<MediaType | "">("");
  const [year, setYear] = useState("");
  const [person, setPerson] = useState("");
  const [items, setItems] = useState<MediaItemDTO[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  useEffect(() => {
    setItems(data?.results ?? []);
  }, [data]);

  useEffect(() => {
    setSelectedId(null);
  }, [mediaType, year, person]);

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
                item={m}
                title={m.title}
                poster={m.thumbUrl}
                playable={m.playable}
                onOpen={() => setSelectedId(m.id)}
              />
            </article>
          ))}
        </Grid>
      )}
      <MediaDetailView
        open={selectedId !== null}
        items={items}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(null)}
        onItemUpdated={(updated) =>
          setItems((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          )
        }
        onItemDeleted={(id, nextId) => {
          setItems((current) => current.filter((item) => item.id !== id));
          setSelectedId(nextId);
        }}
      />
    </Container>
  );
}
