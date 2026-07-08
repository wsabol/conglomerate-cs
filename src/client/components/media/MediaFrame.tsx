import { useState } from "react";
import type { MediaType } from "@shared/types";
import { Icon, type IconName } from "../ui/Icon";
import { MediaLightbox } from "./MediaLightbox";
import styles from "./MediaFrame.module.css";

export interface MediaFrameProps {
  type: MediaType;
  src: string;
  title?: string | null;
  caption?: string | null;
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
  playable = true,
  poster,
  onOpen,
}: MediaFrameProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  function handlePhotoOpen() {
    if (onOpen) {
      onOpen();
    } else {
      setLightboxOpen(true);
    }
  }

  return (
    <figure className={styles.frame}>
      {type === "photo" && (
        <>
          <button
            type="button"
            className={styles.imageButton}
            onClick={handlePhotoOpen}
          >
            <img
              className={styles.image}
              src={src}
              alt={title ?? "Archived photo"}
              loading="lazy"
            />
          </button>
          <MediaLightbox
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            src={src}
            title={title}
            caption={caption}
          />
        </>
      )}

      {type === "video" &&
        (playable ? (
          <video
            className={styles.video}
            src={src}
            controls
            preload="metadata"
            poster={poster ?? undefined}
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
  return (
    <div className={styles.doc}>
      <Icon name={TYPE_ICON[type]} size={22} label={type} />
      <span>{title ?? "Archived file"}</span>
      <a className={styles.download} href={src} download>
        Download
      </a>
    </div>
  );
}
