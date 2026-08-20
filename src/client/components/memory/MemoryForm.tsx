import { useState } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { MentionTextArea, RadioGroup } from "../form";
import modalStyles from "../form/modal.module.css";
import {
  memoryFormSchema,
  type MemoryFormValue,
} from "@shared/schemas/annotation";
import { ANNOTATION_TYPES } from "@shared/types";
import { cn } from "../../lib/cn";
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
  initial?: Partial<MemoryFormValue>;
  submitLabel: string;
  title?: string;
  inModal?: boolean;
  submitting?: boolean;
  deleting?: boolean;
  error?: string | null;
  onSubmit: (value: MemoryFormValue) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}

export function MemoryForm({
  initial,
  submitLabel,
  title,
  inModal = false,
  submitting,
  deleting,
  error,
  onSubmit,
  onCancel,
  onDelete,
}: MemoryFormProps) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [annotationType, setAnnotationType] = useState(
    initial?.annotationType ?? "personal_memory",
  );
  const [incorporatePref, setIncorporatePref] = useState(
    initial?.incorporatePref ?? "no_pref",
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const formClass = inModal ? modalStyles.modalForm : styles.form;
  const actionsClass = inModal
    ? cn(modalStyles.modalActions, onDelete && modalStyles.modalActionsWithDelete)
    : styles.actions;
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

      <MentionTextArea
        label="What do you remember?"
        placeholder="Write it down..."
        value={body}
        onChange={setBody}
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

      {(validationError || error) && (
        <p className={errorClass} role="alert">
          {validationError ?? error}
        </p>
      )}

      <div className={actionsClass}>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={submitting || deleting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        {onDelete && (
          <Button
            type="button"
            variant="danger"
            loading={deleting}
            disabled={submitting}
            onClick={onDelete}
          >
            Delete
          </Button>
        )}
        <Button
          type="submit"
          loading={submitting}
          disabled={!body.trim() || deleting}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
