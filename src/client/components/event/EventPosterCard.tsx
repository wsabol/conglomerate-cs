import { useState } from "react";
import { FileInput } from "../form";
import { SectionTitle } from "../ui/Card";
import { MediaLightbox } from "../media/MediaLightbox";
import { useAuth } from "../../lib/auth";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { patchEvent, performancePatch } from "../../lib/events";
import { uploadFile } from "../../lib/media";
import type { EventDetailDTO } from "@shared/dto";
import styles from "./event.module.css";
import { cn } from "@client/lib/cn";

interface EventPosterCardProps {
  event: EventDetailDTO;
  onReload: () => void;
}

export function EventPosterCard({ event, onReload }: EventPosterCardProps) {
  const { isEditor } = useAuth();
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const posterUrl = event.performance?.eventPosterUrl;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!posterUrl && (!isEditor || isNarrow)) return null;

  async function handleUpload(files: FileList) {
    const file = files[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      setProgress(0);
      const item = await uploadFile(event.id, file, setProgress);
      if (item.mediaType !== "photo") {
        throw new Error("Event poster must be an image.");
      }

      await patchEvent(event.slug, {
        performance: performancePatch(event, {
          eventPosterId: item.id,
        }),
      });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className={cn(styles.sidebarCard, styles.eventPosterCard)}>
      <SectionTitle>Event poster</SectionTitle>
      {posterUrl ? (
        <>
          <button
            type="button"
            className={styles.posterButton}
            onClick={() => setLightboxOpen(true)}
          >
            <img className={styles.posterImage} src={posterUrl} alt="" />
          </button>
          <MediaLightbox
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            src={posterUrl}
            title="Event poster"
          />
        </>
      ) : (
        <div className={styles.posterUpload}>
          <p className={styles.posterEmpty}>No poster yet.</p>
          <FileInput
            label={busy ? "Uploading…" : "Upload event poster"}
            accept="image/*"
            onFiles={handleUpload}
          />
          {progress !== null && (
            <div
              className={styles.posterProgress}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={styles.posterProgressBar}
                style={{ width: `${progress}%` }}
              />
              <span className={styles.posterProgressLabel}>{progress}%</span>
            </div>
          )}
          {error && (
            <p className={styles.posterError} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
