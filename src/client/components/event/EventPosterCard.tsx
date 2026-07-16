import { useState } from "react";
import { FileInput } from "../form";
import { SectionTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";
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
  const canManage = isEditor && !isNarrow;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);

  if (!posterUrl && !canManage) return null;

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
      setReplacing(false);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleClear() {
    if (!window.confirm("Clear the event poster?")) return;
    setBusy(true);
    setError(null);
    try {
      await patchEvent(event.slug, {
        performance: performancePatch(event, {
          eventPosterId: null,
        }),
      });
      setReplacing(false);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear poster.");
    } finally {
      setBusy(false);
    }
  }

  const uploadControls = (
    <div className={styles.posterUpload}>
      {!posterUrl && <p className={styles.posterEmpty}>No poster yet.</p>}
      <FileInput
        label={busy ? "Uploading…" : posterUrl ? "Replace poster" : "Upload event poster"}
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
  );

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
          {canManage && (
            <div className={cn(styles.posterActions, replacing && styles.replacing)}>
              <button
                type="button"
                className={styles.actionButton}
                disabled={busy}
                onClick={() => setReplacing((open) => !open)}
              >
                {replacing ? (
                  <><Icon name="chevron-left" size={15} /> Cancel</>
                ) : (
                  <><Icon name="edit" size={15} /> Replace</>
                )}
              </button>
              {!replacing && <button
                  type="button"
                  className={cn(styles.actionButton, styles.danger)}
                  disabled={busy}
                  onClick={handleClear}
                >
                  <Icon name="trash" size={15} /> Clear
                </button>}
            </div>
          )}
          {canManage && replacing && uploadControls}
          {canManage && error && !replacing && (
            <p className={styles.posterError} role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        uploadControls
      )}
    </div>
  );
}
