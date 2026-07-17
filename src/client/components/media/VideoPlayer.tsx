import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "../ui/Icon";
import { VideoLightbox } from "./VideoLightbox";
import styles from "./VideoPlayer.module.css";

export interface VideoPlayerProps {
  src: string;
  mediaId?: number;
  playbackUrl?: string | null;
  title?: string | null;
  caption?: string | null;
  poster?: string | null;
  aspectRatio?: CSSProperties["aspectRatio"];
  overlay?: boolean;
  onOpen?: () => void;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  mediaId,
  playbackUrl,
  title,
  caption,
  poster,
  aspectRatio,
  overlay = false,
  onOpen,
}: VideoPlayerProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [duration, setDuration] = useState<string | null>(null);
  const label = title ?? "Play video";
  const useStream = Boolean(playbackUrl && mediaId);

  useEffect(() => {
    if (useStream) return;

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = src;

    function handleLoadedMetadata() {
      setDuration(formatDuration(video.duration));
    }

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.src = "";
    };
  }, [src, useStream]);

  function handleOpen() {
    if (onOpen) {
      onOpen();
    } else {
      setLightboxOpen(true);
    }
  }

  const tileStyle =
    aspectRatio != null ? ({ aspectRatio } satisfies CSSProperties) : undefined;

  const tile = (
    <button
      type="button"
      className={styles.tile}
      style={tileStyle}
      onClick={handleOpen}
      aria-label={label}
    >
      {poster ? (
        <img className={styles.poster} src={poster} alt="" />
      ) : (
        <div className={styles.placeholder}>
          <Icon name="video" size={28} label="Video" />
          {title && <span className={styles.placeholderTitle}>{title}</span>}
        </div>
      )}
      <span className={styles.playButton} aria-hidden="true">
        <Icon name="play" size={22} />
      </span>
      {duration && <span className={styles.duration}>{duration}</span>}
    </button>
  );

  const visual = overlay ? (
    <div className={styles.mediaSurface}>
      {tile}
      <div className={styles.overlay} aria-hidden="true" />
    </div>
  ) : (
    tile
  );

  return (
    <>
      {visual}
      <VideoLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        src={src}
        mediaId={mediaId}
        playbackUrl={playbackUrl}
        title={title}
        caption={caption}
        poster={poster}
      />
    </>
  );
}
