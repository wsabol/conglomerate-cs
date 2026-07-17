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

function supportsDocumentPictureInPicture(): boolean {
  return "documentPictureInPicture" in window;
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
  const videoShellRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const label = title ?? "Video playback";
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pipDismissed, setPipDismissed] = useState(false);
  const [nativePipReady, setNativePipReady] = useState(false);
  const useStream = Boolean(playbackUrl && mediaId);
  const useDocumentPip = useStream && supportsDocumentPictureInPicture();
  const canUsePictureInPicture =
    useDocumentPip ||
    (!useStream &&
      typeof document !== "undefined" &&
      document.pictureInPictureEnabled);

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause();
      setPlaybackError(null);
      setIframeSrc(null);
      setLoading(false);
      setPipDismissed(false);
      setNativePipReady(false);
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
    if (!open || useStream) return;

    function onPipChange() {
      if (document.pictureInPictureElement) {
        setPipDismissed(true);
      } else if (pipDismissed) {
        onClose();
      }
    }

    document.addEventListener("pictureinpicturechange", onPipChange);
    return () =>
      document.removeEventListener("pictureinpicturechange", onPipChange);
  }, [open, useStream, pipDismissed, onClose]);

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
  }, [open, useStream, onClose, src, nativePipReady]);

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

  async function popOutToDocumentPip() {
    const shell = videoShellRef.current;
    const docPip = window.documentPictureInPicture;
    if (!shell || !docPip) return;

    try {
      const pipWindow = await docPip.requestWindow({
        width: Math.max(shell.clientWidth, 320),
        height: Math.max(shell.clientHeight, 180),
      });

      pipWindow.document.body.style.margin = "0";
      pipWindow.document.body.style.background = "#000";
      pipWindow.document.body.append(shell);
      setPipDismissed(true);

      pipWindow.addEventListener(
        "pagehide",
        () => {
          onClose();
        },
        { once: true },
      );
    } catch {
      // Browser blocked or rejected the pop-out request.
    }
  }

  async function handlePictureInPicture() {
    if (useDocumentPip) {
      await popOutToDocumentPip();
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;

    try {
      await video.requestPictureInPicture();
      setPipDismissed(true);
    } catch {
      // Metadata not ready or PiP blocked.
    }
  }

  function handleLoadedData() {
    const video = videoRef.current;
    if (!video || video.videoWidth > 0) return;
    setPlaybackError(
      "This video uses a format your browser cannot play. Download the file to watch in QuickTime or VLC.",
    );
  }

  function handleLoadedMetadata() {
    setNativePipReady(true);
  }

  function handleError() {
    setPlaybackError(
      "Playback failed. The file may use an unsupported codec. Try downloading it instead.",
    );
  }

  if (!open) return null;

  const downloadHref = src ?? (mediaId ? `/media/${mediaId}?variant=original` : "#");
  const streamIframeAllow = useDocumentPip
    ? "accelerometer; gyroscope; autoplay; encrypted-media"
    : "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture";

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
        className={styles.video}
        src={iframeSrc}
        title={label}
        allow={streamIframeAllow}
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
      disablePictureInPicture={!nativePipReady}
      onLoadedMetadata={handleLoadedMetadata}
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
            {canUsePictureInPicture && !playbackError && (
              <button
                type="button"
                className={styles.pip}
                onClick={() => void handlePictureInPicture()}
                aria-label="Open picture-in-picture"
              >
                <Icon name="pip" />
              </button>
            )}
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

        <div
          ref={videoShellRef}
          className={pipDismissed ? undefined : styles.videoShell}
        >
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
