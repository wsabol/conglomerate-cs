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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const titleId = useId();
  const label = title ?? "Video playback";
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pipDismissed, setPipDismissed] = useState(false);
  const useStream = Boolean(playbackUrl && mediaId);

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause();
      setPlaybackError(null);
      setIframeSrc(null);
      setLoading(false);
      setPipDismissed(false);
      return;
    }

    if (pipDismissed) return;

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
  }, [open, pipDismissed, onClose]);

  useEffect(() => {
    if (!open || !useStream || !iframeSrc) return;

    function onMessage(e: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.__privateUnstableMessageType !== "event") return;
      if (data.eventName === "enterpictureinpicture") {
        setPipDismissed(true);
      } else if (data.eventName === "leavepictureinpicture") {
        onClose();
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, useStream, iframeSrc, onClose]);

  useEffect(() => {
    if (!open || useStream) return;

    const video = videoRef.current;
    if (!video) return;

    function onEnterPip() {
      setPipDismissed(true);
    }

    function onLeavePip() {
      onClose();
    }

    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
    };
  }, [open, useStream, onClose]);

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

  const player = playbackError ? (
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
        ref={iframeRef}
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
  );

  return createPortal(
    <div
      className={pipDismissed ? styles.pipKeeper : styles.overlay}
      aria-hidden={pipDismissed || undefined}
      onMouseDown={
        pipDismissed
          ? undefined
          : (e) => {
              if (e.target === e.currentTarget) onClose();
            }
      }
    >
      <div
        ref={dialogRef}
        className={pipDismissed ? undefined : styles.dialog}
        role={pipDismissed ? undefined : "dialog"}
        aria-modal={pipDismissed ? undefined : true}
        aria-labelledby={pipDismissed ? undefined : titleId}
      >
        {!pipDismissed && (
          <>
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
          </>
        )}

        <div className={pipDismissed ? undefined : styles.videoShell}>
          {player}
        </div>

        {!pipDismissed && caption && (
          <p className={styles.caption}>{caption}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
