import { cn } from "../../lib/cn";
import { Icon } from "../ui/Icon";
import { parseMentionSegments } from "@shared/mentions";
import type { AnnotationType } from "@shared/types";
import styles from "./Memory.module.css";

const TYPE_LABELS: Record<AnnotationType, string> = {
  personal_memory: "",
  secondhand_account: "Secondhand",
  correction: "Correction",
  quote: "Quote",
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
  onEdit?: () => void;
}

export function Memory({
  body,
  authorName,
  dateLabel,
  annotationType,
  onEdit,
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
        {annotationType !== "personal_memory" && (<>
          <span aria-hidden="true">-</span>
          <span className={styles.typeLabel}>{TYPE_LABELS[annotationType]}</span>
        </>)}
        {onEdit && (
            <button type="button" className={styles.actionButton} onClick={onEdit}>
              <Icon name="edit" size={15} /> Edit
            </button>
          )}
      </div>
    </article>
  );
}
