import { useState } from "react";
import { FileInput } from "../form";
import { uploadFile } from "../../lib/media";
import type { MediaItemDTO } from "@shared/dto";
import styles from "./MediaUpload.module.css";

interface MediaUploadProps {
  eventId: number;
  onUploaded: (item: MediaItemDTO) => void;
}

export function MediaUpload({ eventId, onUploaded }: MediaUploadProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList) {
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        setProgress(0);
        const item = await uploadFile(eventId, file, setProgress);
        onUploaded(item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <FileInput
        label={busy ? "Uploading…" : "Choose files or drag them here"}
        accept="image/*,video/*,audio/*,application/pdf"
        multiple
        onFiles={handleFiles}
      />
      {progress !== null && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={styles.bar} style={{ width: `${progress}%` }} />
          <span className={styles.progressLabel}>{progress}%</span>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
