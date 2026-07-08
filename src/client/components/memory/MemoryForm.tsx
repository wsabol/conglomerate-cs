import { useState } from "react";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { RadioGroup, Select, TextArea } from "../form";
import modalStyles from "../form/modal.module.css";
import type {
  AnnotationType,
  IncorporatePref,
} from "@shared/types";
import styles from "./MemoriesSection.module.css";

export interface MemoryFormValue {
  body: string;
  annotationType: AnnotationType;
  incorporatePref: IncorporatePref;
  peopleIds: number[];
}

const TYPE_OPTIONS = [
  { value: "personal_memory", label: "Something I personally remember" },
  { value: "secondhand_account", label: "Something someone else told me" },
  { value: "correction", label: "A correction or clarification" },
  { value: "quote", label: "A quote or saying" },
];

const INCORPORATE_OPTIONS = [
  { value: "no_pref", label: "No preference" },
  { value: "yes", label: "Yes - fold this into the main record" },
  { value: "separate", label: "Keep this as a separate memory" },
];

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
  const [annotationType, setAnnotationType] = useState<AnnotationType>(
    initial?.annotationType ?? "personal_memory",
  );
  const [incorporatePref, setIncorporatePref] = useState<IncorporatePref>(
    initial?.incorporatePref ?? "no_pref",
  );
  const [peopleIds, setPeopleIds] = useState<number[]>(initial?.peopleIds ?? []);

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
        if (!body.trim()) return;
        onSubmit({ body: body.trim(), annotationType, incorporatePref, peopleIds });
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
        onChange={(v) => setAnnotationType(v as AnnotationType)}
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

      {/* <Select
        label="Should editors incorporate this?"
        value={incorporatePref}
        onChange={(e) => setIncorporatePref(e.target.value as IncorporatePref)}
        options={INCORPORATE_OPTIONS}
      />

      {error && (
        <p className={errorClass} role="alert">
          {error}
        </p>
      )} */}

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
