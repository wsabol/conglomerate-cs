import { cn } from "../../lib/cn";
import { Icon } from "../ui/Icon";
import { parseMentionSegments } from "@shared/mentions";
import type { AnnotationType } from "@shared/types";
import styles from "./Memory.module.css";

const TYPE_LABELS: Record<AnnotationType, string> = {
  personal_memory: "Firsthand memory",
  secondhand_account: "Secondhand account",
  correction: "Correction",
  quote: "Quote",
  context: "Context",
};

function MentionBody({ body }: { body: string }) {
  const segments = parseMentionSegments(body);
  if (segments.length === 0) return <>{body}</>;

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "mention" ? (
          <strong key={index} className={styles.mention}>
            {segment.displayName}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export interface MemoryProps {
  body: string;
  authorName: string;
  dateLabel: string;
  annotationType: AnnotationType;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function Memory({
  body,
  authorName,
  dateLabel,
  annotationType,
  canEdit,
  onEdit,
  onDelete,
}: MemoryProps) {
  const isQuote = annotationType === "quote";
  return (
    <article className={styles.memory}>
      <p className={cn(styles.body, isQuote && styles.quote)}>
        <MentionBody body={body} />
      </p>
      <div className={styles.attribution}>
        <span className={styles.author}>{authorName}</span>
        <span aria-hidden="true">-</span>
        <span>{dateLabel}</span>
        <span aria-hidden="true">-</span>
        <span className={styles.typeLabel}>{TYPE_LABELS[annotationType]}</span>
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
