import { useEffect, useState } from "react";
import { SectionTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { MediaFrame } from "../media/MediaFrame";
import { MediaUpload } from "../media/MediaUpload";
import { EmptyState } from "../state";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { patchEvent, performancePatch } from "../../lib/events";
import { deleteMedia } from "../../lib/media";
import { cn } from "../../lib/cn";
import type { EventDetailDTO, MediaItemDTO } from "@shared/dto";
import styles from "./EventDetailView.module.css";

interface EventMediaGalleryProps {
  event: EventDetailDTO;
  canUpload: boolean;
  isEditor: boolean;
  onReload: () => void;
}

export function EventMediaGallery({
  event,
  canUpload,
  isEditor,
  onReload,
}: EventMediaGalleryProps) {
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const canManage = isEditor && !isNarrow;
  const [mediaItems, setMediaItems] = useState<MediaItemDTO[]>(
    event.mediaItems,
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMediaItems(event.mediaItems);
  }, [event.mediaItems]);

  const gallery = mediaItems.filter(
    (item) => item.url && item.status === "published",
  );

  async function handleSetHero(item: MediaItemDTO) {
    setBusyId(item.id);
    setError(null);
    try {
      await patchEvent(event.slug, { heroImageId: item.id });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set hero image.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetPoster(item: MediaItemDTO) {
    setBusyId(item.id);
    setError(null);
    try {
      await patchEvent(event.slug, {
        performance: performancePatch(event, {
          eventPosterId: item.id,
        }),
      });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set poster.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(item: MediaItemDTO) {
    if (
      !window.confirm(
        "Remove this media from the archive? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await deleteMedia(item.id);
      setMediaItems((current) => current.filter((m) => m.id !== item.id));
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove media.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.mediaSection}>
      <SectionTitle>Media</SectionTitle>
      {gallery.length > 0 ? (
        <div className={styles.mediaGallery}>
          {gallery.map((item) => {
            const isHero = item.id === event.heroImageId;
            const isPoster = item.id === event.performance?.eventPosterId;
            const isPhoto = item.mediaType === "photo";
            const busy = busyId === item.id;

            return (
              <div key={item.id} className={styles.mediaItem}>
                <div className={styles.mediaVisual}>
                  <MediaFrame
                    type={item.mediaType}
                    src={item.url ?? ""}
                    title={item.title}
                    caption={item.description}
                    poster={item.thumbUrl}
                  />
                  {(isHero || isPoster) && (
                    <div className={styles.mediaBadges}>
                      {isHero && (
                        <span className={styles.mediaBadge}>Hero</span>
                      )}
                      {isPoster && (
                        <span className={styles.mediaBadge}>Poster</span>
                      )}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className={styles.mediaActions}>
                    {isPhoto && !isHero && (
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={busy}
                        onClick={() => handleSetHero(item)}
                      >
                        <Icon name="star" size={15} /> Set as hero
                      </button>
                    )}
                    {isPhoto && !isPoster && (
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={busy}
                        onClick={() => handleSetPoster(item)}
                      >
                        <Icon name="photo" size={15} /> Set as poster
                      </button>
                    )}
                    <button
                      type="button"
                      className={cn(styles.actionButton, styles.danger)}
                      disabled={busy}
                      onClick={() => handleRemove(item)}
                    >
                      <Icon name="trash" size={15} /> Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No media yet." icon="photo" size="sm" />
      )}
      {error && (
        <p className={styles.mediaError} role="alert">
          {error}
        </p>
      )}
      {canUpload && (
        <div className={styles.mediaUpload}>
          <MediaUpload
            eventId={event.id}
            onUploaded={(item) => {
              setMediaItems((current) => [item, ...current]);
              onReload();
            }}
          />
        </div>
      )}
    </section>
  );
}
