import { useEffect, useState } from "react";
import { SectionTitle } from "../ui/Card";
import { MediaFrame } from "../media/MediaFrame";
import { MediaUpload } from "../media/MediaUpload";
import { EmptyState } from "../state";
import type { EventDetailDTO, MediaItemDTO } from "@shared/dto";
import styles from "./EventDetailView.module.css";

interface EventMediaGalleryProps {
  event: EventDetailDTO;
  canUpload: boolean;
  onReload: () => void;
}

export function EventMediaGallery({
  event,
  canUpload,
  onReload,
}: EventMediaGalleryProps) {
  const [mediaItems, setMediaItems] = useState<MediaItemDTO[]>(
    event.mediaItems,
  );

  useEffect(() => {
    setMediaItems(event.mediaItems);
  }, [event.mediaItems]);

  const gallery = mediaItems.filter(
    (item) => item.url && item.status === "published",
  );

  return (
    <section className={styles.mediaSection}>
      <SectionTitle>Media</SectionTitle>
      {gallery.length > 0 ? (
        <div className={styles.mediaGallery}>
          {gallery.map((item) => (
            <MediaFrame
              key={item.id}
              type={item.mediaType}
              src={item.url ?? ""}
              title={item.title}
              caption={item.description}
              poster={item.thumbUrl}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No media yet." icon="photo" size="sm" />
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
