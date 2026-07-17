import type { MediaItemDTO } from "@shared/dto";
import { Icon } from "../ui/Icon";
import styles from "./ProcessingMediaCard.module.css";

const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading…",
  uploaded: "Processing video…",
  processing: "Processing video…",
  failed: "Processing failed",
};

export interface ProcessingMediaCardProps {
  item: MediaItemDTO;
  onRetry?: (item: MediaItemDTO) => void;
  retrying?: boolean;
}

export function ProcessingMediaCard({
  item,
  onRetry,
  retrying = false,
}: ProcessingMediaCardProps) {
  const label = STATUS_LABEL[item.status] ?? "Processing…";
  const isFailed = item.status === "failed";

  return (
    <div className={styles.card}>
      <div className={styles.iconWrap} aria-hidden="true">
        {isFailed ? (
          <Icon name="video" size={28} label="Video" />
        ) : (
          <span className={styles.spinner} />
        )}
      </div>

      <div className={styles.body}>
        <p className={styles.title}>{item.title ?? "Video"}</p>
        <p className={styles.status}>{label}</p>
        {isFailed && (
          <p className={styles.error}>
            {item.processingError?.message ??
              "This video could not be prepared for playback. The original file is still safely stored."}
          </p>
        )}
        <div className={styles.actions}>
          {item.url && (
            <a className={styles.link} href={item.url} download>
              Download original
            </a>
          )}
          {isFailed && onRetry && (
            <button
              type="button"
              className={styles.retry}
              disabled={retrying}
              onClick={() => onRetry(item)}
            >
              {retrying ? "Retrying…" : "Retry processing"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
