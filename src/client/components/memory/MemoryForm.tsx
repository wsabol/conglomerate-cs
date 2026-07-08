import { useState } from "react";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { RadioGroup, TextArea } from "../form";
import modalStyles from "../form/modal.module.css";
import {
  memoryFormSchema,
  type MemoryFormValue,
} from "@shared/schemas/annotation";
import { ANNOTATION_TYPES } from "@shared/types";
import { zodFieldErrors } from "../../lib/zodErrors";
import styles from "./MemoriesSection.module.css";

export type { MemoryFormValue };

const TYPE_OPTIONS = ANNOTATION_TYPES.map((value) => ({
  value,
  label:
    value === "personal_memory"
      ? "Something I personally remember"
      : value === "secondhand_account"
        ? "Something someone else told me"
        : value === "correction"
          ? "A correction or clarification"
          : "A quote or saying",
}));

interface MemoryFormProps {
  people: { id: number; displayName: string }[];
  initial?: Partial<MemoryFormValue>;
  submitLabel: string;
  title?: string;
  inModal?: boolean;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (value: MemoryFormValue) => void;
  onCancel?: () => void;
}

export function MemoryForm({
  people,
  initial,
  submitLabel,
  title,
  inModal = false,
  submitting,
  error,
  onSubmit,
  onCancel,
}: MemoryFormProps) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [annotationType, setAnnotationType] = useState(
    initial?.annotationType ?? "personal_memory",
  );
  const [incorporatePref, setIncorporatePref] = useState(
    initial?.incorporatePref ?? "no_pref",
  );
  const [peopleIds, setPeopleIds] = useState<number[]>(initial?.peopleIds ?? []);
  const [validationError, setValidationError] = useState<string | null>(null);

  const togglePerson = (id: number) =>
    setPeopleIds((cur) =>
      cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id],
    );

  const formClass = inModal ? modalStyles.modalForm : styles.form;
  const actionsClass = inModal ? modalStyles.modalActions : styles.actions;
  const errorClass = inModal ? modalStyles.modalError : styles.error;

  return (
    <form
      className={formClass}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = memoryFormSchema.safeParse({
          body,
          annotationType,
          incorporatePref,
          peopleIds,
        });
        if (!parsed.success) {
          const errors = zodFieldErrors(parsed.error);
          setValidationError(errors.body ?? "Fix the highlighted fields.");
          return;
        }
        setValidationError(null);
        onSubmit(parsed.data);
      }}
    >
      {title && !inModal && <p className={styles.formTitle}>{title}</p>}

      <TextArea
        label="What do you remember?"
        placeholder="Write it down..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={inModal ? 5 : 4}
        required
      />

      <RadioGroup
        legend="This is -"
        name="annotation-type"
        value={annotationType}
        onChange={(v) => setAnnotationType(v as MemoryFormValue["annotationType"])}
        options={TYPE_OPTIONS}
        compact={inModal}
      />

      {people.length > 0 && (
        <div className={styles.peoplePicker}>
          <span className={styles.pickerLabel}>Who's in this memory?</span>
          <div className={styles.pills}>
            {people.map((p) => (
              <Pill
                key={p.id}
                active={peopleIds.includes(p.id)}
                onClick={() => togglePerson(p.id)}
              >
                {p.displayName}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {(validationError || error) && (
        <p className={errorClass} role="alert">
          {validationError ?? error}
        </p>
      )}

      <div className={actionsClass}>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting} disabled={!body.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
