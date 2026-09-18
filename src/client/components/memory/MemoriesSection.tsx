import { useEffect, useState } from "react";
import { SectionTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { EmptyState, Spinner } from "../state";
import { Memory } from "./Memory";
import { MemoryForm, type MemoryFormValue } from "./MemoryForm";
import { useAuth } from "../../lib/auth";
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "../../lib/annotations";
import { eventDateLabel } from "../../lib/format";
import type { AnnotationDTO } from "@shared/dto";
import type { AnnotationTargetType } from "@shared/types";
import styles from "./MemoriesSection.module.css";
import { Icon } from "../ui/Icon";

interface MemoriesSectionProps {
  targetType: AnnotationTargetType;
  targetId: number;
  initial: AnnotationDTO[];
  contextLabel?: string;
  title?: string;
  addLabel?: string;
  emptyTitle?: string;
  loading?: boolean;
  onChanged?: () => void;
}

export function MemoriesSection({
  targetType,
  targetId,
  initial,
  contextLabel,
  title = "Memberberries",
  addLabel = "Add membery",
  emptyTitle = "No memberies yet",
  loading = false,
  onChanged,
}: MemoriesSectionProps) {
  const { user, isEditor, loading: authLoading } = useAuth();
  const [items, setItems] = useState<AnnotationDTO[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AnnotationDTO | null>(null);

  useEffect(() => {
    if (!loading) setItems(initial);
  }, [initial, loading]);

  const canModify = (a: AnnotationDTO) =>
    !!user && (isEditor || a.authorId === user.id);

  function openAdd() {
    setError(null);
    setAdding(true);
  }

  function closeAdd() {
    setAdding(false);
    setError(null);
  }

  function openEdit(a: AnnotationDTO) {
    setError(null);
    setEditing(a);
  }

  function closeEdit() {
    setEditing(null);
    setError(null);
  }

  async function handleCreate(value: MemoryFormValue) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createAnnotation({ targetType, targetId, ...value });
      setItems((cur) => [created, ...cur]);
      setAdding(false);
      if (created.incorporatePref !== "separate") onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your memory.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(value: MemoryFormValue) {
    if (!editing) return;
    if (value.body === editing.body && value.annotationType === editing.annotationType && value.incorporatePref === editing.incorporatePref) {
      setEditing(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateAnnotation(editing.id, value);
      setItems((cur) => cur.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(null);
      if (editing.incorporatePref !== "separate" || updated.incorporatePref !== "separate") onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your memory.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(a: AnnotationDTO) {
    if (!window.confirm("Delete this memory? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAnnotation(a.id);
      setItems((cur) => cur.filter((x) => x.id !== a.id));
      setEditing(null);
      if (a.incorporatePref !== "separate") onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that memory.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <div className={styles.header}>
        <SectionTitle>{title}</SectionTitle>
      </div>

      <div className={styles.list}>
        {loading ? (
          <Spinner label={`Loading ${title.toLowerCase()}`} />
        ) : items.length === 0 ? (
          <EmptyState 
            title={emptyTitle}
            icon="flask"
            size="sm"
            action={<Button type="button" size="sm" variant="primary" style={{marginTop: 'var(--space-2)'}} onClick={openAdd}><Icon name="plus" size={14} /> {addLabel}</Button>}
          >
            Be the first to add what you remember.
          </EmptyState>
        ) : (
          items.map((a) => (
            <Memory
              key={a.id}
              body={a.body}
              authorName={a.authorName}
              dateLabel={eventDateLabel({
                eventDate: a.createdOn.slice(0, 10),
                eventTime: null,
                datePrecision: "exact",
              })}
              annotationType={a.annotationType}
              onEdit={canModify(a) ? () => openEdit(a) : undefined}
            />
          ))
        )}
      </div>

      {items.length > 0 && !loading && !authLoading && user && (
        <Button className={styles.addButton} type="button" variant={"ghost-primary"} size="sm" onClick={openAdd}>
          <Icon name="plus" size={14} />
          {addLabel}
        </Button>
      )}

      {!loading && !authLoading && !user && (
        <p className={styles.signedOut}>Sign in to add a memory.</p>
      )}

      <Modal
        open={adding}
        onClose={closeAdd}
        title={addLabel}
        context={contextLabel}
        initialFocusSelector='[role="textbox"]'
      >
        <MemoryForm
          key="add"
          submitLabel="Add to the record"
          inModal
          submitting={submitting}
          error={error}
          onSubmit={handleCreate}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title="Edit memory"
        context={contextLabel}
      >
        {editing && (
          <MemoryForm
            key={editing.id}
            submitLabel="Save changes"
            inModal
            submitting={submitting}
            deleting={deleting}
            error={error}
            initial={{
              body: editing.body,
              annotationType: editing.annotationType,
              incorporatePref: editing.incorporatePref,
            }}
            onSubmit={handleUpdate}
            onDelete={() => handleDelete(editing)}
          />
        )}
      </Modal>
    </section>
  );
}
