import { MemoriesSection } from "../memory/MemoriesSection";
import { EmptyState } from "../state";
import { eventDateOnlyLabel } from "../../lib/format";
import type { EventDetailDTO } from "@shared/dto";
import { EventMediaGallery } from "./EventMediaGallery";
import styles from "./EventDetailView.module.css";

interface EventSummaryPanelProps {
  event: EventDetailDTO;
  canUpload: boolean;
  isEditor: boolean;
  onReload: () => void;
}

export function EventSummaryPanel({
  event,
  canUpload,
  isEditor,
  onReload,
}: EventSummaryPanelProps) {
  return (
    <>
      {event.summary ? (
        <p className={styles.summary}>{event.summary}</p>
      ) : (
        <EmptyState title="No summary yet." icon="document" size="sm" />
      )}

      <div className={styles.memories}>
        <MemoriesSection
          targetType="event"
          targetId={event.id}
          initial={event.annotations}
          contextLabel={`${eventDateOnlyLabel(event)} · ${event.title}`}
        />
      </div>

      <EventMediaGallery
        event={event}
        canUpload={canUpload}
        isEditor={isEditor}
        onReload={onReload}
      />
    </>
  );
}
