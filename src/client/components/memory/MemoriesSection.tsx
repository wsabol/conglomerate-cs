import { useState } from "react";
import { SectionTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { EmptyState } from "../state";
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
  people: { id: number; displayName: string }[];
  contextLabel?: string;
}

export function MemoriesSection({
  targetType,
  targetId,
  initial,
  people,
  contextLabel,
}: MemoriesSectionProps) {
  const { user, isEditor, loading } = useAuth();
  const [items, setItems] = useState<AnnotationDTO[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AnnotationDTO | null>(null);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your memory.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(value: MemoryFormValue) {
    if (!editing) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateAnnotation(editing.id, value);
      setItems((cur) => cur.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your memory.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(a: AnnotationDTO) {
    if (!window.confirm("Delete this memory? This cannot be undone.")) return;
    try {
      await deleteAnnotation(a.id);
      setItems((cur) => cur.filter((x) => x.id !== a.id));
    } catch {
      window.alert("Could not delete that memory. Please try again.");
    }
  }

  return (
    <section>
      <div className={styles.header}>
        <SectionTitle>Memberberries</SectionTitle>
        {!loading && user && (
          <Button type="button" size="sm" onClick={openAdd}>
            <Icon name="plus" size={14} />
            Add membery
          </Button>
        )}
      </div>

      <div className={styles.list}>
        {items.length === 0 ? (
          <EmptyState title="No memberies yet" icon="flask" size="sm">
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
              people={a.people.map((p) => p.displayName)}
              canEdit={canModify(a)}
              onEdit={canModify(a) ? () => openEdit(a) : undefined}
              onDelete={canModify(a) ? () => handleDelete(a) : undefined}
            />
          ))
        )}
      </div>

      {!loading && !user && (
        <p className={styles.signedOut}>Sign in to add a memory.</p>
      )}

      <Modal
        open={adding}
        onClose={closeAdd}
        title="Add a memory"
        context={contextLabel}
      >
        <MemoryForm
          key="add"
          people={people}
          submitLabel="Add to the record"
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
        title="Edit memory"
        context={contextLabel}
      >
        {editing && (
          <MemoryForm
            key={editing.id}
            people={people}
            submitLabel="Save changes"
            inModal
            submitting={submitting}
            error={error}
            initial={{
              body: editing.body,
              annotationType: editing.annotationType,
              incorporatePref: editing.incorporatePref,
              peopleIds: editing.people.map((p) => p.id),
            }}
            onSubmit={handleUpdate}
            onCancel={closeEdit}
          />
        )}
      </Modal>
    </section>
  );
}
