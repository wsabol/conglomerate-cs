import { useEffect, useState } from "react";
import { Grid } from "../layout";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { EmptyState } from "../state";
import { MediaFrame } from "../media/MediaFrame";
import { cn } from "../../lib/cn";
import { patchEvent, sourcesInput, type EventUpdateBody } from "../../lib/events";
import { SourceForm, type SourceFormValue } from "./SourceForm";
import { useEditorModal } from "./useEditorModal";
import type { EventDetailDTO, EventSourceDTO } from "@shared/dto";
import styles from "./SourcesSection.module.css";

interface SourcesSectionProps {
  event: EventDetailDTO;
  isEditor: boolean;
  onReload: () => void;
  contextLabel?: string;
}

function formValueToInput(value: SourceFormValue) {
  return {
    sourceType: value.sourceType,
    description: value.description || null,
    url: value.sourceType === "url" ? value.url || null : null,
    mediaId: value.sourceType === "media" ? value.mediaId : null,
  };
}

function sourceToInitial(source: EventSourceDTO): Partial<SourceFormValue> {
  return {
    sourceType: source.sourceType,
    description: source.description ?? "",
    url: source.url ?? "",
    mediaId: source.mediaId,
    mediaUrl: source.mediaUrl,
  };
}

export function SourcesSection({
  event,
  isEditor,
  onReload,
  contextLabel,
}: SourcesSectionProps) {
  const [sources, setSources] = useState<EventSourceDTO[]>(event.sources);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EventSourceDTO | null>(null);
  const modalOpen = adding || editing !== null;
  const { submitting, error, save } = useEditorModal(modalOpen);

  useEffect(() => {
    setSources(event.sources);
  }, [event.sources]);

  const mediaSources = sources.filter((s) => s.sourceType === "media");
  const listSources = sources.filter((s) => s.sourceType !== "media");

  function openAdd() {
    setAdding(true);
  }

  function closeAdd() {
    setAdding(false);
  }

  function openEdit(source: EventSourceDTO) {
    setEditing(source);
  }

  function closeEdit() {
    setEditing(null);
  }

  async function persistSources(
    next: NonNullable<EventUpdateBody["sources"]>,
  ): Promise<boolean> {
    return save(async () => {
      const updated = await patchEvent(event.slug, { sources: next });
      setSources(updated.sources);
      onReload();
    }, "Could not save source.");
  }

  async function handleCreate(value: SourceFormValue) {
    const ok = await persistSources([
      ...sourcesInput(sources),
      formValueToInput(value),
    ]);
    if (ok) setAdding(false);
  }

  async function handleUpdate(value: SourceFormValue) {
    if (!editing) return;
    const ok = await persistSources(
      sourcesInput(
        sources.map((s) =>
          s.id === editing.id ? { ...s, ...formValueToInput(value) } : s,
        ),
      ),
    );
    if (ok) setEditing(null);
  }

  async function handleDelete(source: EventSourceDTO) {
    if (!window.confirm("Delete this source? This cannot be undone.")) return;
    await persistSources(sourcesInput(sources.filter((s) => s.id !== source.id)));
  }

  const modalContext =
    contextLabel && contextLabel.length > 50
      ? `${contextLabel.slice(0, 50)}...`
      : contextLabel;

  return (
    <section>
      {sources.length === 0 ? (
        <EmptyState title="No sources recorded yet" icon="help" size="sm">
          {isEditor ? (
            <>
              Add a source to help others learn more about this event.
              <Button
                type="button"
                size="sm"
                variant="primary"
                style={{ marginTop: "var(--space-2)" }}
                onClick={openAdd}
              >
                <Icon name="plus" size={14} /> Add source
              </Button>
            </>
          ) : (
            "No corroborating sources have been recorded for this event yet."
          )}
        </EmptyState>
      ) : (
        <div className={styles.content}>
          {mediaSources.length > 0 && (
            <Grid min={220}>
              {mediaSources.map((source) => (
                <article key={source.id} className={styles.mediaSource}>
                  <MediaFrame
                    type="photo"
                    src={source.mediaUrl ?? ""}
                    caption={source.description}
                  />
                  {isEditor && (
                    <SourceActions
                      onEdit={() => openEdit(source)}
                      onDelete={() => handleDelete(source)}
                    />
                  )}
                </article>
              ))}
            </Grid>
          )}

          {listSources.length > 0 && (
            <ul className={styles.sourceList}>
              {listSources.map((source) => (
                <li key={source.id} className={styles.sourceListItem}>
                  <Icon
                    name={source.sourceType === "url" ? "link" : "document"}
                    size={16}
                    className={styles.sourceIcon}
                  />
                  <div className={styles.sourceBody}>
                    {source.sourceType === "url" && source.url ? (
                      <a
                        className={styles.sourceLink}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.description || source.url}
                      </a>
                    ) : (
                      <p className={styles.sourceText}>{source.description}</p>
                    )}
                  </div>
                  {isEditor && (
                    <SourceActions
                      onEdit={() => openEdit(source)}
                      onDelete={() => handleDelete(source)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <hr />

      {isEditor && (
        <div className={styles.header}>
          <Button
            type="button"
            variant={sources.length === 0 ? "ghost-primary" : "primary"}
            size="sm"
            onClick={openAdd}
          >
            <Icon name="plus" size={14} />
            Add source
          </Button>
        </div>
      )}

      <Modal
        open={adding}
        onClose={closeAdd}
        title="Add source"
        context={modalContext}
      >
        <SourceForm
          key="add"
          eventId={event.id}
          submitLabel="Add source"
          inModal
          submitting={submitting}
          error={error}
          onSubmit={handleCreate}
          onCancel={closeAdd}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title="Edit source"
        context={modalContext}
      >
        {editing && (
          <SourceForm
            key={editing.id}
            eventId={event.id}
            submitLabel="Save changes"
            inModal
            submitting={submitting}
            error={error}
            initial={sourceToInitial(editing)}
            onSubmit={handleUpdate}
            onCancel={closeEdit}
          />
        )}
      </Modal>
    </section>
  );
}

function SourceActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.sourceActions}>
      <button type="button" className={styles.actionButton} onClick={onEdit}>
        <Icon name="edit" size={15} /> Edit
      </button>
      <button
        type="button"
        className={cn(styles.actionButton, styles.danger)}
        onClick={onDelete}
      >
        <Icon name="trash" size={15} /> Delete
      </button>
    </div>
  );
}
