import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { fetchPlayback, streamIframeSrc } from "../../lib/playback";
import styles from "./MediaLightbox.module.css";

export interface VideoLightboxProps {
  open: boolean;
  onClose: () => void;
  /** Legacy direct URL for non-Stream videos. */
  src?: string;
  /** Stream-backed video id. */
  mediaId?: number;
  playbackUrl?: string | null;
  title?: string | null;
  caption?: string | null;
  poster?: string | null;
}

export function VideoLightbox({
  open,
  onClose,
  src,
  mediaId,
  playbackUrl,
  title,
  caption,
  poster,
}: VideoLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const label = title ?? "Video playback";
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const useStream = Boolean(playbackUrl && mediaId);

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause();
      setPlaybackError(null);
      setIframeSrc(null);
      setLoading(false);
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

  useEffect(() => {
    if (!open || !useStream || !mediaId) return;

    let cancelled = false;
    setLoading(true);
    setPlaybackError(null);
    setIframeSrc(null);

    fetchPlayback(mediaId)
      .then((playback) => {
        if (cancelled) return;
        setIframeSrc(streamIframeSrc(playback.token));
      })
      .catch(() => {
        if (cancelled) return;
        setPlaybackError(
          "Playback authorization failed. Try again or download the original file.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, useStream, mediaId]);

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

  const downloadHref = src ?? (mediaId ? `/media/${mediaId}?variant=original` : "#");

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
              <a className={styles.downloadLink} href={downloadHref} download>
                Download video
              </a>
            </div>
          ) : useStream ? (
            loading || !iframeSrc ? (
              <div className={styles.playbackError}>
                <p>Loading playback…</p>
              </div>
            ) : (
              <iframe
                className={styles.video}
                src={iframeSrc}
                title={label}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )
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
