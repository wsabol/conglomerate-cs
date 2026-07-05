import { useState } from "react";
import { SectionTitle } from "../ui/Card";
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

interface MemoriesSectionProps {
  targetType: AnnotationTargetType;
  targetId: number;
  initial: AnnotationDTO[];
  people: { id: number; displayName: string }[];
}

export function MemoriesSection({
  targetType,
  targetId,
  initial,
  people,
}: MemoriesSectionProps) {
  const { user, isEditor, loading } = useAuth();
  const [items, setItems] = useState<AnnotationDTO[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AnnotationDTO | null>(null);

  const canModify = (a: AnnotationDTO) =>
    !!user && (isEditor || a.authorId === user.id);

  async function handleCreate(value: MemoryFormValue) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createAnnotation({ targetType, targetId, ...value });
      setItems((cur) => [created, ...cur]);
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
      // Surface a lightweight failure; keep the item in place.
      window.alert("Could not delete that memory. Please try again.");
    }
  }

  return (
    <section>
      <SectionTitle>Memories</SectionTitle>

      <div className={styles.list}>
        {items.length === 0 ? (
          <EmptyState title="No memories yet" icon="mic">
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
              onEdit={canModify(a) ? () => setEditing(a) : undefined}
              onDelete={canModify(a) ? () => handleDelete(a) : undefined}
            />
          ))
        )}
      </div>

      {!loading &&
        (user ? (
          <div style={{ marginTop: "var(--space-5)" }}>
            <MemoryForm
              key={items.length}
              people={people}
              submitLabel="Add memory"
              title="Add a memory"
              submitting={submitting}
              error={error}
              onSubmit={handleCreate}
            />
          </div>
        ) : (
          <p className={styles.signedOut}>Sign in to add a memory.</p>
        ))}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit memory"
      >
        {editing && (
          <MemoryForm
            people={people}
            submitLabel="Save changes"
            submitting={submitting}
            error={error}
            initial={{
              body: editing.body,
              annotationType: editing.annotationType,
              incorporatePref: editing.incorporatePref,
              peopleIds: editing.people.map((p) => p.id),
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </section>
  );
}
