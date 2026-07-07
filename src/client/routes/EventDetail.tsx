import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Container, Grid, SidebarLayout } from "../components/layout";
import { SectionTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Icon, type IconName } from "../components/ui/Icon";
import { MediaFrame } from "../components/media/MediaFrame";
import { MediaUpload } from "../components/media/MediaUpload";
import { MemoriesSection } from "../components/memory/MemoriesSection";
import { AutocompleteInput, FileInput, TextArea } from "../components/form";
import { ErrorState, Spinner } from "../components/state";
import { useAuth } from "../lib/auth";
import { useAsync } from "../lib/useAsync";
import { getEvent, patchEvent, performancePatch } from "../lib/events";
import { apiFetch } from "../lib/api";
import { uploadFile } from "../lib/media";
import {
  confidenceLabel,
  eventDateTimeMetaLabel,
  eventTypeLabel,
} from "../lib/format";
import type { Confidence } from "@shared/types";
import type { EventDetailDTO, MediaItemDTO } from "@shared/dto";
import type { ListResult } from "@shared/types";
import styles from "./EventDetail.module.css";

type DetailTab = "summary" | "description" | "sources";

const CONFIDENCE_ICONS: Record<Confidence, IconName> = {
  high: "confidence-high",
  medium: "confidence-medium",
  low: "confidence-low",
};

export default function EventDetail() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync(
    () => getEvent(slug!),
    [slug],
  );

  if (loading && !data) {
    return (
      <Container>
        <Spinner label="Loading event" />
      </Container>
    );
  }
  if (error || !data) {
    return (
      <Container>
        <ErrorState
          title="Event not found"
          message={error?.message}
          onRetry={reload}
        />
      </Container>
    );
  }

  const event = data;

  return <EventDetailView event={event} onReload={reload} />;
}

function MetaItem({
  icon,
  iconLabel,
  children,
  tone = "default",
}: {
  icon: IconName;
  iconLabel: string;
  children: ReactNode;
  tone?: Confidence | "default";
}) {
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

function SidebarEmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <>
      <p className={styles.sidebarEmpty}>{message}</p>
      <button type="button" className={styles.sidebarLink} onClick={onAction}>
        {actionLabel}
      </button>
    </>
  );
}

function OtherActsCard({
  event,
  isEditor,
  onReload,
}: {
  event: EventDetailDTO;
  isEditor: boolean;
  onReload: () => void;
}) {
  const acts = event.acts;
  const [modalOpen, setModalOpen] = useState(false);

  if (acts.length === 0 && !isEditor) return null;

  return (
    <>
      <div className={styles.sidebarCard}>
        <SectionTitle>Acts on the bill</SectionTitle>
        {acts.length > 0 ? (
          <>
            <ul className={styles.billList}>
              {acts.map((act) => (
                <li key={act.id}>{act.name}</li>
              ))}
            </ul>
            {isEditor && (
              <button
                type="button"
                className={styles.sidebarLink}
                onClick={() => setModalOpen(true)}
              >
                Edit acts
              </button>
            )}
          </>
        ) : (
          <SidebarEmptyState
            message="No acts listed yet."
            actionLabel="Add acts"
            onAction={() => setModalOpen(true)}
          />
        )}
      </div>
      <OtherActsModal
        event={event}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          onReload();
        }}
      />
    </>
  );
}

function OtherActsModal({
  event,
  open,
  onClose,
  onSaved,
}: {
  event: EventDetailDTO;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draftActs, setDraftActs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: actsData } = useAsync(
    () =>
      open
        ? apiFetch<ListResult<string>>("/api/acts")
        : Promise.resolve(null),
    [open],
  );

  const suggestions = useMemo(
    () => actsData?.results ?? [],
    [actsData],
  );

  useEffect(() => {
    if (!open) return;
    setDraftActs(event.acts.map((a) => a.name));
    setError(null);
  }, [open, event.acts]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await patchEvent(event.slug, {
        acts: draftActs.map((name) => ({ name, billingRole: "unknown" })),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save acts.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Acts on the bill">
      <form className={styles.modalForm} onSubmit={handleSave}>
        {draftActs.length > 0 && (
          <ul className={styles.modalList}>
            {draftActs.map((name) => (
              <li key={name}>
                <span>{name}</span>
                <button
                  type="button"
                  className={styles.modalRemove}
                  onClick={() =>
                    setDraftActs((cur) => cur.filter((n) => n !== name))
                  }
                  aria-label={`Remove ${name}`}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <AutocompleteInput
          label="Add an act"
          placeholder="Search or type an act name"
          suggestions={suggestions}
          exclude={draftActs}
          disabled={submitting}
          onSubmit={(name) => setDraftActs((cur) => [...cur, name])}
        />

        {error && (
          <p className={styles.modalError} role="alert">
            {error}
          </p>
        )}

        <div className={styles.modalActions}>
          <Button type="submit" loading={submitting}>
            Save acts
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SetlistCard({
  event,
  isEditor,
  onReload,
}: {
  event: EventDetailDTO;
  isEditor: boolean;
  onReload: () => void;
}) {
  const setlistLines =
    event.performance?.setlistText
      ?.split("\n")
      .map((line) => line.trim())
      .filter(Boolean) ?? [];
  const [modalOpen, setModalOpen] = useState(false);

  if (setlistLines.length === 0 && !isEditor) return null;

  return (
    <>
      <div className={styles.sidebarCard}>
        <SectionTitle>Setlist</SectionTitle>
        {setlistLines.length > 0 ? (
          <>
            <ul className={styles.billList}>
              {setlistLines.map((song) => (
                <li key={song}>{song}</li>
              ))}
            </ul>
            {isEditor && (
              <button
                type="button"
                className={styles.sidebarLink}
                onClick={() => setModalOpen(true)}
              >
                Edit setlist
              </button>
            )}
          </>
        ) : (
          <SidebarEmptyState
            message="No setlist recorded yet."
            actionLabel="Add setlist"
            onAction={() => setModalOpen(true)}
          />
        )}
      </div>
      <SetlistModal
        event={event}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          onReload();
        }}
      />
    </>
  );
}

function SetlistModal({
  event,
  open,
  onClose,
  onSaved,
}: {
  event: EventDetailDTO;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [setlistText, setSetlistText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSetlistText(event.performance?.setlistText ?? "");
    setError(null);
  }, [open, event.performance?.setlistText]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await patchEvent(event.slug, {
        performance: performancePatch(event, {
          setlistText: setlistText.trim() || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save setlist.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Setlist">
      <form className={styles.modalForm} onSubmit={handleSave}>
        <TextArea
          label="Songs"
          hint="One song per line"
          value={setlistText}
          onChange={(e) => setSetlistText(e.target.value)}
          rows={10}
        />

        {error && (
          <p className={styles.modalError} role="alert">
            {error}
          </p>
        )}

        <div className={styles.modalActions}>
          <Button type="submit" loading={submitting}>
            Save setlist
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EventPosterCard({
  event,
  onReload,
}: {
  event: EventDetailDTO;
  onReload: () => void;
}) {
  const { isEditor } = useAuth();
  const posterUrl = event.performance?.eventPosterUrl;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!posterUrl && !isEditor) return null;

  async function handleUpload(files: FileList) {
    const file = files[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      setProgress(0);
      const item = await uploadFile(event.id, file, setProgress);
      if (item.mediaType !== "photo") {
        throw new Error("Event poster must be an image.");
      }

      await patchEvent(event.slug, {
        performance: performancePatch(event, {
          eventPosterId: item.id,
        }),
      });
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className={styles.sidebarCard}>
      <SectionTitle>Event poster</SectionTitle>
      {posterUrl ? (
        <img className={styles.posterImage} src={posterUrl} alt="" />
      ) : (
        <>
          <p className={styles.posterEmpty}>No poster yet.</p>
          <FileInput
            label={busy ? "Uploading…" : "Upload event poster"}
            accept="image/*"
            onFiles={handleUpload}
          />
          {progress !== null && (
            <div
              className={styles.posterProgress}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={styles.posterProgressBar}
                style={{ width: `${progress}%` }}
              />
              <span className={styles.posterProgressLabel}>{progress}%</span>
            </div>
          )}
          {error && (
            <p className={styles.posterError} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function EventDetailView({
  event,
  onReload,
}: {
  event: EventDetailDTO;
  onReload: () => void;
}) {
  const { user, isEditor } = useAuth();
  const [tab, setTab] = useState<DetailTab>("summary");
  const [mediaItems, setMediaItems] = useState<MediaItemDTO[]>(
    event.mediaItems,
  );

  const performers = event.people.filter(
    (p) => p.relationshipType === "performer",
  );
  const gallery = mediaItems.filter((m) => m.url && m.status === "published");
  const uniquePeople = Array.from(
    new Map(
      event.people.map((p) => [
        p.personId,
        { id: p.personId, displayName: p.displayName },
      ]),
    ).values(),
  );
  const promotionText = event.performance?.promotionText;

  return (
    <Container>
      <div className={styles.hero}>
        {event.heroImageUrl ? (
          <img className={styles.heroImage} src={event.heroImageUrl} alt="" />
        ) : (
          <div className={styles.heroPlaceholder} />
        )}
        <div className={styles.heroOverlay}></div>
      </div>

      <header className={styles.header}>
        <span className={styles.eyebrow}>{eventTypeLabel(event.eventType)}</span>
        <h1 className={styles.title}>{event.title}</h1>
        <div className={styles.meta}>
          <MetaItem icon="calendar" iconLabel="Date">
            {eventDateTimeMetaLabel(event)}
          </MetaItem>
          {event.place && (
            <MetaItem icon="place" iconLabel="Place">
              {event.place.name}
            </MetaItem>
          )}
          {performers.length > 0 && (
            <MetaItem icon="people" iconLabel="Personnel">
              {performers.map((p) => p.displayName).join(", ")}
            </MetaItem>
          )}
          {event.headlined && (
            <MetaItem icon="star" iconLabel="Headlined">
              Headlined
            </MetaItem>
          )}
          <MetaItem
            icon={CONFIDENCE_ICONS[event.confidence]}
            iconLabel="Confidence"
            tone={event.confidence}
          >
            {confidenceLabel(event.confidence)}
          </MetaItem>
        </div>
      </header>

      <div className={styles.content}>
        <SidebarLayout
          aside={
            <>
              <OtherActsCard
                event={event}
                isEditor={isEditor}
                onReload={onReload}
              />
              <EventPosterCard event={event} onReload={onReload} />
              <SetlistCard event={event} isEditor={isEditor} onReload={onReload} />
            </>
          }
        >
          <div
            className={styles.tabList}
            role="tablist"
            aria-label="Event details"
          >
            {(
              [
                ["summary", "Summary"],
                ["description", "Event Description"],
                ["sources", "Sources"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={styles.tab}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "summary" && (
            <div
              role="tabpanel"
              id="panel-summary"
              aria-labelledby="tab-summary"
              className={styles.tabPanel}
            >
              {event.summary ? (
                <p className={styles.summary}>{event.summary}</p>
              ) : (
                <p className={styles.emptyPanel}>No summary yet.</p>
              )}

              <div className={styles.memories}>
                <MemoriesSection
                  targetType="event"
                  targetId={event.id}
                  initial={event.annotations}
                  people={uniquePeople}
                />
              </div>
            </div>
          )}

          {tab === "description" && (
            <div
              role="tabpanel"
              id="panel-description"
              aria-labelledby="tab-description"
              className={styles.tabPanel}
            >
              {promotionText ? (
                <p className={styles.description}>{promotionText}</p>
              ) : (
                <p className={styles.emptyPanel}>No event description yet.</p>
              )}

              <section className={styles.mediaSection}>
                <SectionTitle>Media</SectionTitle>
                {gallery.length > 0 ? (
                  <Grid min={220}>
                    {gallery.map((m) => (
                      <MediaFrame
                        key={m.id}
                        type={m.mediaType}
                        src={m.url ?? ""}
                        title={m.title}
                        caption={m.description}
                        poster={m.thumbUrl}
                      />
                    ))}
                  </Grid>
                ) : (
                  <p className={styles.emptyMedia}>No media uploaded yet.</p>
                )}
                {user && (
                  <MediaUpload
                    eventId={event.id}
                    onUploaded={(item) => {
                      setMediaItems((cur) => [item, ...cur]);
                      onReload();
                    }}
                  />
                )}
              </section>
            </div>
          )}

          {tab === "sources" && (
            <div
              role="tabpanel"
              id="panel-sources"
              aria-labelledby="tab-sources"
              className={styles.tabPanel}
            >
              {event.sources.length > 0 ? (
                <div className={styles.sources}>
                  {event.sources.map((s) => (
                    <div key={s.id} className={styles.source}>
                      <Icon
                        name={s.sourceType === "url" ? "link" : "document"}
                        size={16}
                      />
                      {s.url ? (
                        <a
                          className={styles.sourceLink}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {s.description || s.url}
                        </a>
                      ) : (
                        <span>{s.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyPanel}>No sources recorded yet.</p>
              )}
            </div>
          )}

          {isEditor && (
            <p className={styles.editLink}>
              <Link to={`/events/${event.slug}/edit`}>Edit this event</Link>
            </p>
          )}
        </SidebarLayout>
      </div>
    </Container>
  );
}
