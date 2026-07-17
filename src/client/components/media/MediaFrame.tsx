import { useState, type CSSProperties, type ReactNode } from "react";
import type { MediaType } from "@shared/types";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "../ui/Icon";
import { MediaLightbox } from "./MediaLightbox";
import { VideoPlayer } from "./VideoPlayer";
import styles from "./MediaFrame.module.css";

export interface MediaFrameProps {
  type: MediaType;
  src: string;
  title?: string | null;
  caption?: string | null;
  /** CSS aspect-ratio for photo/video tiles (e.g. `1`, `"4 / 3"`). */
  aspectRatio?: CSSProperties["aspectRatio"];
  /** When false, photos render statically with no lightbox or zoom cursor. */
  isOpenable?: boolean;
  /** Applies a bottom fade overlay on photo/video surfaces. */
  overlay?: boolean;
  /** Whether the file supports inline playback (audio/video). */
  playable?: boolean;
  poster?: string | null;
  onOpen?: () => void;
}

const TYPE_ICON: Record<MediaType, IconName> = {
  photo: "photo",
  video: "video",
  audio: "audio",
  document: "document",
  link: "link",
};

export function MediaFrame({
  type,
  src,
  title,
  caption,
  aspectRatio,
  isOpenable = true,
  overlay = false,
  playable = true,
  poster,
  onOpen,
}: MediaFrameProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const mediaStyle =
    aspectRatio != null ? ({ aspectRatio } satisfies CSSProperties) : undefined;

  function handlePhotoOpen() {
    if (onOpen) {
      onOpen();
    } else {
      setLightboxOpen(true);
    }
  }

  function wrapVisual(visual: ReactNode) {
    if (!overlay) return visual;

    return (
      <div className={styles.mediaSurface}>
        {visual}
        <div className={styles.overlay} aria-hidden="true" />
      </div>
    );
  }

  const photo = (
    <img
      className={cn(styles.image, !isOpenable && styles.imageStatic)}
      style={mediaStyle}
      src={src}
      alt={title ?? "Archived photo"}
      loading="lazy"
    />
  );

  return (
    <figure className={styles.frame}>
      {type === "photo" &&
        (isOpenable ? (
          <>
            <button
              type="button"
              className={styles.imageButton}
              onClick={handlePhotoOpen}
            >
              {wrapVisual(photo)}
            </button>
            <MediaLightbox
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              src={src}
              title={title}
              caption={caption}
            />
          </>
        ) : (
          wrapVisual(photo)
        ))}

      {type === "video" &&
        (playable ? (
          <VideoPlayer
            src={src}
            title={title}
            caption={caption}
            poster={poster}
            aspectRatio={aspectRatio}
            overlay={overlay}
            onOpen={onOpen}
          />
        ) : (
          <DownloadTile type={type} src={src} title={title} />
        ))}

      {type === "audio" &&
        (playable ? (
          <div className={styles.audio}>
            <span className={styles.iconRow}>
              <Icon name="audio" size={16} /> {title ?? "Audio recording"}
            </span>
            <audio src={src} controls preload="metadata" />
          </div>
        ) : (
          <DownloadTile type={type} src={src} title={title} />
        ))}

      {(type === "document" || type === "link") && (
        <a
          className={styles.doc}
          href={src}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name={TYPE_ICON[type]} size={22} label={type} />
          <span>{title ?? (type === "link" ? "External link" : "Document")}</span>
          <Icon name="external" size={16} />
        </a>
      )}

      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}

function DownloadTile({
  type,
  src,
  title,
}: Pick<MediaFrameProps, "type" | "src" | "title">) {
  const hint =
    type === "video"
      ? "This video format cannot play in the browser. Download to view in QuickTime or VLC."
      : null;

  return (
    <div className={styles.doc}>
      <Icon name={TYPE_ICON[type]} size={22} label={type} />
      <div className={styles.docText}>
        <span>{title ?? "Archived file"}</span>
        {hint && <span className={styles.downloadHint}>{hint}</span>}
      </div>
      <a className={styles.download} href={src} download>
        Download
      </a>
    </div>
  );
}
