import type { FormEvent, ReactNode } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import styles from "../form/modal.module.css";

interface EditorModalFormProps {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
}

export function EditorModalForm({
  open,
  onClose,
  title,
  submitLabel,
  submitting,
  error,
  onSubmit,
  children,
}: EditorModalFormProps) {
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit();
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className={styles.modalForm} onSubmit={handleSubmit}>
        {children}

        {error && (
          <p className={styles.modalError} role="alert">
            {error}
          </p>
        )}

        <div className={styles.modalActions}>
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
