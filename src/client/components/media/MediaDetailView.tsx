import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { DATE_PRECISIONS, type DatePrecision } from "@shared/types";
import type { AnnotationDTO, MediaItemDTO, PersonDTO } from "@shared/dto";
import { formatEventDate } from "@shared/date";
import { listAnnotations } from "../../lib/annotations";
import { useAuth } from "../../lib/auth";
import { deleteMedia, patchMedia } from "../../lib/media";
import { listPeople } from "../../lib/people";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { TextArea, TextField, Select } from "../form";
import { MemoriesSection } from "../memory/MemoriesSection";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { MediaDetailVideo } from "./MediaDetailVideo";
import styles from "./MediaDetailView.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const MEDIA_LABELS: Record<MediaItemDTO["mediaType"], string> = {
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  document: "Document",
  link: "Link",
};

interface MediaDetailViewProps {
  open: boolean;
  items: MediaItemDTO[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
  onItemUpdated: (item: MediaItemDTO) => void;
  onItemDeleted: (id: number, nextId: number | null) => void;
  isHero?: (item: MediaItemDTO) => boolean;
  isPoster?: (item: MediaItemDTO) => boolean;
  onSetHero?: (item: MediaItemDTO) => Promise<void>;
  onSetPoster?: (item: MediaItemDTO) => Promise<void>;
}

export function MediaDetailView({
  open,
  items,
  selectedId,
  onSelect,
  onClose,
  onItemUpdated,
  onItemDeleted,
  isHero,
  isPoster,
  onSetHero,
  onSetPoster,
}: MediaDetailViewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const informationRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const trayDragStart = useRef<number | null>(null);
  const trayDragCurrent = useRef(0);
  const trayWasDragged = useRef(false);
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const { user, isEditor } = useAuth();
  const [annotations, setAnnotations] = useState<AnnotationDTO[] | null>(null);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayDragOffset, setTrayDragOffset] = useState(0);
  const [trayDragging, setTrayDragging] = useState(false);

  const index = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const item = items[index];
  const canManage =
    Boolean(user) && (isEditor || item?.createdById === user?.id);
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;

  function selectRelative(delta: -1 | 1) {
    const next = items[index + delta];
    if (next) onSelect(next.id);
  }

  useEffect(() => {
    if (!open || !item) return;
    informationRef.current?.scrollTo({ top: 0, behavior: "auto" });
    setAnnotations(null);
    setAnnotationError(null);
    let cancelled = false;
    listAnnotations("media", item.id)
      .then((result) => {
        if (!cancelled) setAnnotations(result.results);
      })
      .catch(() => {
        if (!cancelled) {
          setAnnotationError("Memories could not be loaded.");
          setAnnotations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, item?.id]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      const nestedDialog = (event.target as HTMLElement | null)?.closest(
        '[role="dialog"]',
      );
      if (nestedDialog && nestedDialog !== dialogRef.current) return;

      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasPrevious) selectRelative(-1);
      if (event.key === "ArrowRight" && hasNext) selectRelative(1);
      if (event.key !== "Tab" || !dialogRef.current) return;

      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => !node.closest("[inert]"));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose, hasPrevious, hasNext, index, items]);

  useEffect(() => {
    if (!open) {
      setTagging(false);
      setEditing(false);
      setActionError(null);
      setTrayOpen(false);
      setTrayDragOffset(0);
    }
  }, [open]);

  if (!open || !item) return null;

  const contextDate =
    item.eventDate && item.eventDatePrecision
      ? formatEventDate(
          item.eventDate,
          item.eventTime,
          item.eventDatePrecision,
        )
      : formatEventDate(item.capturedDate, null, item.datePrecision);
  const contextTitle = item.eventTitle ?? item.title ?? MEDIA_LABELS[item.mediaType];

  function handleTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (
      isNarrow &&
      !trayOpen &&
      dy > 80 &&
      Math.abs(dy) > Math.abs(dx)
    ) {
      onClose();
      return;
    }
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx > 0 && hasPrevious) selectRelative(-1);
    if (dx < 0 && hasNext) selectRelative(1);
  }

  function handleTrayTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0];
    trayDragStart.current = touch.clientY;
    trayDragCurrent.current = 0;
    trayWasDragged.current = false;
    setTrayDragging(true);
    setTrayDragOffset(0);
  }

  function handleTrayTouchMove(event: TouchEvent) {
    if (trayDragStart.current === null) return;
    const touch = event.changedTouches[0];
    const delta = touch.clientY - trayDragStart.current;
    const constrained = trayOpen ? Math.max(0, delta) : Math.min(0, delta);
    trayDragCurrent.current = constrained;
    if (Math.abs(constrained) > 8) trayWasDragged.current = true;
    setTrayDragOffset(constrained);
    event.preventDefault();
  }

  function handleTrayTouchEnd() {
    const delta = trayDragCurrent.current;
    if (trayOpen && delta > 60) setTrayOpen(false);
    if (!trayOpen && delta < -60) setTrayOpen(true);
    trayDragStart.current = null;
    trayDragCurrent.current = 0;
    setTrayDragOffset(0);
    setTrayDragging(false);
  }

  function handleTrayToggle() {
    if (trayWasDragged.current) {
      trayWasDragged.current = false;
      return;
    }
    setTrayOpen((current) => !current);
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setActionBusy(key);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "That action could not be completed.",
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this media from the archive? This cannot be undone.",
      )
    ) {
      return;
    }
    const nextId = items[index + 1]?.id ?? items[index - 1]?.id ?? null;
    await runAction("delete", async () => {
      await deleteMedia(item.id);
      onItemDeleted(item.id, nextId);
    });
  }

  return createPortal(
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <section
          className={styles.viewer}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <h2 id={titleId} className={styles.srOnly}>
            {contextTitle}
          </h2>
          <header className={styles.viewerHeader}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClose}
              aria-label="Close media detail"
            >
              <Icon name="close" />
            </button>
            <span className={styles.position} aria-live="polite">
              {index + 1} of {items.length}
            </span>
          </header>

          <div className={styles.mediaStage}>
            {item.mediaType === "photo" && item.url && (
              <img
                className={styles.primaryImage}
                src={item.url}
                alt={item.title ?? "Archived photo"}
              />
            )}
            {item.mediaType === "video" && (
              <MediaDetailVideo
                mediaId={item.id}
                src={item.url}
                playbackUrl={item.playbackUrl}
                poster={item.thumbUrl}
                title={item.title}
              />
            )}
            {item.mediaType === "audio" && item.url && (
              <div className={styles.audioPlayer}>
                <Icon name="audio" size={44} label="Audio recording" />
                <strong>{item.title ?? "Audio recording"}</strong>
                <audio src={item.url} controls preload="metadata" />
              </div>
            )}
            {(item.mediaType === "document" || item.mediaType === "link") &&
              item.url && (
                <a
                  className={styles.fileLink}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon
                    name={item.mediaType === "link" ? "link" : "document"}
                    size={42}
                  />
                  <span>{item.title ?? MEDIA_LABELS[item.mediaType]}</span>
                  <Icon name="external" size={18} />
                </a>
              )}
          </div>

          <button
            type="button"
            className={`${styles.navButton} ${styles.previous}`}
            onClick={() => selectRelative(-1)}
            disabled={!hasPrevious}
            aria-label="Previous media"
          >
            <Icon name="chevron-left" />
          </button>
          <button
            type="button"
            className={`${styles.navButton} ${styles.next}`}
            onClick={() => selectRelative(1)}
            disabled={!hasNext}
            aria-label="Next media"
          >
            <Icon name="chevron-right" />
          </button>
        </section>

        <main
          ref={informationRef}
          className={`${styles.information} ${
            trayOpen ? styles.trayOpen : styles.trayClosed
          } ${trayDragging ? styles.trayDragging : ""}`}
          style={
            {
              "--tray-drag": `${trayDragOffset}px`,
            } as CSSProperties
          }
        >
          <button
            type="button"
            className={styles.trayHandle}
            aria-label={trayOpen ? "Close media details" : "Open media details"}
            aria-expanded={!isNarrow || trayOpen}
            onClick={handleTrayToggle}
            onTouchStart={handleTrayTouchStart}
            onTouchMove={handleTrayTouchMove}
            onTouchEnd={handleTrayTouchEnd}
            onTouchCancel={handleTrayTouchEnd}
          >
            <span aria-hidden="true" />
            <span>Details</span>
          </button>
          <div
            className={styles.informationContent}
            aria-hidden={isNarrow && !trayOpen}
            inert={isNarrow && !trayOpen}
          >
          <section className={styles.context}>
            <h3>
              {item.eventSlug ? (
                <Link to={`/events/${item.eventSlug}`} onClick={onClose}>
                  {contextTitle}
                </Link>
              ) : (
                contextTitle
              )}
            </h3>
            <div className={styles.contextMeta}>
              <span>
                <Icon name="calendar" size={16} />
                {contextDate}
              </span>
              {item.eventPlace && (
                <span>
                  <Icon name="place" size={16} />
                  {item.eventPlace.name}
                </span>
              )}
            </div>
            {item.description && (
              <p className={styles.description}>{item.description}</p>
            )}
          </section>

          <section className={styles.section}>
            {item.people.length > 0 ? (
              <div className={styles.people}>
                {item.people.map((person) => (
                  <span key={person.id} className={styles.personBadge}>
                    {person.displayName}
                  </span>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>No one has been tagged yet.</p>
            )}
            <button
                type="button"
                className={styles.textAction}
                onClick={() => setTagging(true)}
              >
                <Icon name="plus" size={16} /> Tag people
              </button>
          </section>

          <section className={styles.section}>
            {annotations === null ? (
              <p className={styles.emptyCopy}>Loading memories…</p>
            ) : (
              <MemoriesSection
                key={item.id}
                targetType="media"
                targetId={item.id}
                initial={annotations}
                contextLabel={contextTitle}
                title="Memories"
                addLabel="Add a memory"
                emptyTitle="No memories yet"
              />
            )}
            {annotationError && (
              <p className={styles.inlineError} role="alert">
                {annotationError}
              </p>
            )}
          </section>

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Details</p>
            <dl className={styles.details}>
              <Detail label="Media type" value={MEDIA_LABELS[item.mediaType]} />
              <Detail
                label="Captured"
                value={formatEventDate(
                  item.capturedDate,
                  null,
                  item.datePrecision,
                )}
              />
              <Detail
                label="Uploaded"
                value={formatEventDate(
                  item.createdOn.slice(0, 10),
                  null,
                  "exact",
                )}
              />
              {item.eventTitle && (
                <Detail label="Event" value={item.eventTitle} />
              )}
              {item.eventPlace && (
                <Detail label="Location" value={item.eventPlace.name} />
              )}
              {item.provenance && (
                <Detail label="Provenance" value={item.provenance} />
              )}
            </dl>

            <div className={styles.actions}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Icon name="edit" size={16} /> Edit metadata
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTagging(true)}
              >
                <Icon name="people" size={16} /> Tag people
              </Button>
            </div>
            {actionError && (
              <p className={styles.inlineError} role="alert">
                {actionError}
              </p>
            )}
          </section>

          {canManage && (
            <section className={styles.section}>
            <p className={styles.sectionTitleEditor}>Editor tools</p>
            <div className={styles.actions}>
              {onSetHero && item.mediaType === "photo" && !isHero?.(item) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={actionBusy === "hero"}
                  onClick={() =>
                    runAction("hero", () => onSetHero(item))
                  }
                >
                  <Icon name="star" size={16} /> Set as hero
                </Button>
              )}
              {onSetPoster &&
                item.mediaType === "photo" &&
                !isPoster?.(item) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={actionBusy === "poster"}
                    onClick={() =>
                      runAction("poster", () => onSetPoster(item))
                    }
                  >
                    <Icon name="photo" size={16} /> Set as poster
                  </Button>
                )}
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={actionBusy === "delete"}
                onClick={handleDelete}
              >
                <Icon name="trash" size={16} /> Delete media
              </Button>
            </div>
            {actionError && (
              <p className={styles.inlineError} role="alert">
                {actionError}
              </p>
            )}
          </section>
          )}
          </div>
        </main>
      </div>

      <PeopleTagModal
        open={tagging}
        item={item}
        onClose={() => setTagging(false)}
        onSaved={(updated) => {
          onItemUpdated(updated);
          setTagging(false);
        }}
      />
      <MetadataModal
        open={editing}
        item={item}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          onItemUpdated(updated);
          setEditing(false);
        }}
      />
    </div>,
    document.body,
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PeopleTagModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: MediaItemDTO;
  onClose: () => void;
  onSaved: (item: MediaItemDTO) => void;
}) {
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(item.people.map((person) => person.id)));
    setError(null);
    setLoading(true);
    listPeople()
      .then((result) => setPeople(result.results))
      .catch(() => setError("People could not be loaded."))
      .finally(() => setLoading(false));
  }, [open, item.id, item.people]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await patchMedia(item.id, { peopleIds: [...selected] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tags could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tag people">
      {loading ? (
        <p>Loading people…</p>
      ) : (
        <div className={styles.peoplePicker}>
          {people.map((person) => (
            <label key={person.id}>
              <input
                type="checkbox"
                checked={selected.has(person.id)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(person.id)) next.delete(person.id);
                    else next.add(person.id);
                    return next;
                  })
                }
              />
              <span>{person.displayName}</span>
            </label>
          ))}
        </div>
      )}
      {error && (
        <p className={styles.inlineError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.modalActions}>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" loading={saving} onClick={save}>
          Save tags
        </Button>
      </div>
    </Modal>
  );
}

function MetadataModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: MediaItemDTO;
  onClose: () => void;
  onSaved: (item: MediaItemDTO) => void;
}) {
  const [description, setDescription] = useState("");
  const [capturedDate, setCapturedDate] = useState("");
  const [datePrecision, setDatePrecision] =
    useState<DatePrecision>("unknown");
  const [provenance, setProvenance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDescription(item.description ?? "");
    setCapturedDate(item.capturedDate ?? "");
    setDatePrecision(item.datePrecision);
    setProvenance(item.provenance ?? "");
    setError(null);
  }, [open, item]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchMedia(item.id, {
        description: description.trim() || null,
        capturedDate: capturedDate || null,
        datePrecision,
        provenance: provenance.trim() || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Metadata could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  const precisionOptions = useMemo(
    () =>
      DATE_PRECISIONS.map((value) => ({
        value,
        label: value[0].toUpperCase() + value.slice(1),
      })),
    [],
  );

  return (
    <Modal open={open} onClose={onClose} title="Edit media metadata">
      <div className={styles.metadataForm}>
        <TextArea
          label="Description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <TextField
          label="Captured date"
          type="date"
          value={capturedDate}
          onChange={(event) => setCapturedDate(event.target.value)}
        />
        <Select
          label="Date precision"
          value={datePrecision}
          options={precisionOptions}
          onChange={(event) =>
            setDatePrecision(event.target.value as DatePrecision)
          }
        />
        <TextArea
          label="Provenance"
          rows={3}
          value={provenance}
          onChange={(event) => setProvenance(event.target.value)}
        />
      </div>
      {error && (
        <p className={styles.inlineError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.modalActions}>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" loading={saving} onClick={save}>
          Save metadata
        </Button>
      </div>
    </Modal>
  );
}
