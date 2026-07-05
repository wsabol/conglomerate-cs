import { cn } from "../../lib/cn";
import { Icon } from "../ui/Icon";
import type { AnnotationType } from "@shared/types";
import styles from "./Memory.module.css";

const TYPE_LABELS: Record<AnnotationType, string> = {
  personal_memory: "Firsthand memory",
  secondhand_account: "Secondhand account",
  correction: "Correction",
  quote: "Quote",
  context: "Context",
};

export interface MemoryProps {
  body: string;
  authorName: string;
  dateLabel: string;
  annotationType: AnnotationType;
  people?: string[];
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function Memory({
  body,
  authorName,
  dateLabel,
  annotationType,
  people,
  canEdit,
  onEdit,
  onDelete,
}: MemoryProps) {
  const isQuote = annotationType === "quote";
  return (
    <article className={styles.memory}>
      <p className={cn(styles.body, isQuote && styles.quote)}>{body}</p>
      <div className={styles.attribution}>
        <span className={styles.author}>{authorName}</span>
        <span aria-hidden="true">-</span>
        <span>{dateLabel}</span>
        <span aria-hidden="true">-</span>
        <span className={styles.typeLabel}>{TYPE_LABELS[annotationType]}</span>
        {people && people.length > 0 && (
          <span className={styles.people}>with {people.join(", ")}</span>
        )}
      </div>
      {canEdit && (onEdit || onDelete) && (
        <div className={styles.actions}>
          {onEdit && (
            <button type="button" className={styles.actionButton} onClick={onEdit}>
              <Icon name="edit" size={15} /> Edit memory
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className={cn(styles.actionButton, styles.danger)}
              onClick={onDelete}
            >
              <Icon name="trash" size={15} /> Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
}
