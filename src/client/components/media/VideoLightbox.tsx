import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { fetchPlayback, streamHlsSrc } from "../../lib/playback";
import { attachStreamHls } from "../../lib/streamHls";
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
  const [streamManifest, setStreamManifest] = useState<string | null>(null);
  const [streamPoster, setStreamPoster] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pipDismissed, setPipDismissed] = useState(false);
  const useStream = Boolean(playbackUrl && mediaId);

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause();
      setPlaybackError(null);
      setStreamManifest(null);
      setStreamPoster(null);
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
    if (!open || !useStream || !mediaId) return;

    let cancelled = false;
    setLoading(true);
    setPlaybackError(null);
    setStreamManifest(null);
    setStreamPoster(null);

    fetchPlayback(mediaId)
      .then((playback) => {
        if (cancelled) return;
        setStreamManifest(
          streamHlsSrc(playback.customerCode, playback.token),
        );
        setStreamPoster(playback.posterUrl);
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

  useEffect(() => {
    if (!open || !useStream || !streamManifest) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let detach: (() => void) | undefined;

    attachStreamHls(video, streamManifest)
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        detach = cleanup;
        void video.play().catch(() => {
          // Autoplay may be blocked until the user presses play.
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPlaybackError(
            "Playback failed. Try again or download the original file.",
          );
        }
      });

    return () => {
      cancelled = true;
      detach?.();
      video.pause();
    };
  }, [open, useStream, streamManifest]);

  useEffect(() => {
    if (!open) return;

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
  }, [open, onClose, useStream, streamManifest, src]);

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
  const videoPoster = (useStream ? streamPoster : poster) ?? undefined;
  const showVideo = !playbackError && (!useStream || Boolean(streamManifest));
  const showLoading = useStream && loading && !playbackError;

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
          {playbackError ? (
            <div className={styles.playbackError}>
              <Icon name="video" size={28} label="Video" />
              <p>{playbackError}</p>
              <a className={styles.downloadLink} href={downloadHref} download>
                Download video
              </a>
            </div>
          ) : showLoading ? (
            <div className={styles.playbackError}>
              <p>Loading playback…</p>
            </div>
          ) : showVideo ? (
            <video
              ref={videoRef}
              className={styles.video}
              src={useStream ? undefined : src}
              poster={videoPoster}
              controls
              autoPlay
              playsInline
              preload="auto"
              onLoadedData={handleLoadedData}
              onError={handleError}
            />
          ) : null}
        </div>

        {!pipDismissed && caption && (
          <p className={styles.caption}>{caption}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
