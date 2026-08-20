import { useCallback, useEffect, useState } from "react";
import { SectionTitle } from "../ui/Card";
import { MediaFrame } from "../media/MediaFrame";
import { MediaDetailView } from "../media/MediaDetailView";
import { MediaUpload } from "../media/MediaUpload";
import { EmptyState } from "../state";
import { useProcessingMediaPoll } from "../../lib/useProcessingMediaPoll";
import { patchEvent, performancePatch } from "../../lib/events";
import { retryProcessing } from "../../lib/media";
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
  const [mediaItems, setMediaItems] = useState<MediaItemDTO[]>(
    event.mediaItems,
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMediaUpdate = useCallback((items: MediaItemDTO[]) => {
    setMediaItems(items);
  }, []);

  useProcessingMediaPoll(mediaItems, handleMediaUpdate);

  useEffect(() => {
    setMediaItems(event.mediaItems);
  }, [event.mediaItems]);

  const gallery = mediaItems.filter(
    (item) =>
      item.url &&
      (item.status === "published" ||
        (item.mediaType === "video" &&
          ["uploading", "uploaded", "processing", "failed"].includes(
            item.status,
          ))),
  );

  async function handleSetHero(item: MediaItemDTO) {
    setBusyId(item.id);
    setError(null);
    try {
      await patchEvent(event.slug, { heroImageId: item.id });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set hero image.");
      throw err;
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
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryProcessing(item: MediaItemDTO) {
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await retryProcessing(item.id);
      setMediaItems((current) =>
        current.map((m) => (m.id === updated.id ? updated : m)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to retry processing.",
      );
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
            const isPublished = item.status === "published";
            const busy = busyId === item.id;

            return (
              <div key={item.id} className={styles.mediaItem}>
                <div className={styles.mediaVisual}>
                  <MediaFrame
                    type={item.mediaType}
                    src={item.url ?? ""}
                    item={item}
                    title={item.title}
                    poster={item.thumbUrl}
                    playable={item.playable}
                    onRetryProcessing={handleRetryProcessing}
                    retryingProcessing={busy}
                    onOpen={
                      isPublished ? () => setSelectedId(item.id) : undefined
                    }
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
      <MediaDetailView
        open={selectedId !== null}
        items={gallery.filter((item) => item.status === "published")}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(null)}
        onItemUpdated={(updated) =>
          setMediaItems((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          )
        }
        onItemDeleted={(id, nextId) => {
          setMediaItems((current) => current.filter((item) => item.id !== id));
          setSelectedId(nextId);
          onReload();
        }}
        isHero={(item) => item.id === event.heroImageId}
        isPoster={(item) => item.id === event.performance?.eventPosterId}
        onSetHero={
          isEditor
            ? async (item) => {
                await handleSetHero(item);
              }
            : undefined
        }
        onSetPoster={
          isEditor
            ? async (item) => {
                await handleSetPoster(item);
              }
            : undefined
        }
      />
    </section>
  );
}
