import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import styles from "./MediaLightbox.module.css";

export interface VideoLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  title?: string | null;
  caption?: string | null;
  poster?: string | null;
}

export function VideoLightbox({
  open,
  onClose,
  src,
  title,
  caption,
  poster,
}: VideoLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const label = title ?? "Video playback";
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause();
      setPlaybackError(null);
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  function handleLoadedData() {
    const video = videoRef.current;
    if (!video || video.videoWidth > 0) return;
    setPlaybackError(
      "This video uses a format your browser cannot play. Download the file to watch in QuickTime or VLC.",
    );
  }

  function handleError() {
    setPlaybackError(
      "Playback failed. The file may use an unsupported codec. Try downloading it instead.",
    );
  }

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className={styles.srOnly}>
          {label}
        </h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close video player"
        >
          <Icon name="close" />
        </button>

        <div className={styles.videoShell}>
          {playbackError ? (
            <div className={styles.playbackError}>
              <Icon name="video" size={28} label="Video" />
              <p>{playbackError}</p>
              <a className={styles.downloadLink} href={src} download>
                Download video
              </a>
            </div>
          ) : (
            <video
              ref={videoRef}
              className={styles.video}
              src={src}
              poster={poster ?? undefined}
              controls
              autoPlay
              playsInline
              preload="auto"
              onLoadedData={handleLoadedData}
              onError={handleError}
            />
          )}
        </div>

        {caption && <p className={styles.caption}>{caption}</p>}
      </div>
    </div>,
    document.body,
  );
}
