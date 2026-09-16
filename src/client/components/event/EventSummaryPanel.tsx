import { MemoriesSection } from "../memory/MemoriesSection";
import { EmptyState } from "../state";
import { eventDateOnlyLabel } from "../../lib/format";
import type { EventDetailDTO } from "@shared/dto";
import { EventMediaGallery } from "./EventMediaGallery";
import styles from "./EventDetailView.module.css";
import { useEffect, useState } from "react";
import { getSummaryStatus } from "../../lib/events";

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
  const [job, setJob] = useState(event.summaryJob);
  const [started, setStarted] = useState<number | null>(() => event.summaryJob && event.summaryJob.requestedVersion > event.summaryJob.completedVersion ? Date.now() : null);
  useEffect(() => { setJob(event.summaryJob); if (event.summaryJob && event.summaryJob.requestedVersion > event.summaryJob.completedVersion) setStarted((current) => current ?? Date.now()); }, [event.summaryJob]);
  useEffect(() => {
    if (!job || job.requestedVersion <= job.completedVersion) return;
    if (document.hidden) {
      const resume = () => { if (!document.hidden) setJob((current) => current ? { ...current } : null); };
      document.addEventListener("visibilitychange", resume);
      return () => document.removeEventListener("visibilitychange", resume);
    }
    let cancelled = false;
    const delay = job.status === "failed" || (started && Date.now() - started > 30_000) ? 15_000 : 2_000;
    const timer = window.setTimeout(async () => {
      if (document.hidden) { setJob((current) => current ? { ...current } : null); return; }
      try {
        const next = await getSummaryStatus(event.slug);
        if (cancelled) return;
        setJob(next.job);
        if (next.job?.status === "complete") { setStarted(null); onReload(); }
      } catch { /* cron will retry; keep the prior narrative visible */ }
    }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [job, started, event.slug, onReload]);
  const pending = !!job && job.requestedVersion > job.completedVersion && job.status !== "failed";
  const background = pending && started !== null && Date.now() - started > 30_000;
  return (
    <>
      <div className={styles.summaryRegion} aria-live="polite">
        <div className={pending && !background ? styles.summaryUpdating : undefined}>
          {event.summary ? <p className={styles.summary}>{event.summary}</p> : <EmptyState title="No summary yet." icon="document" size="sm" />}
        </div>
        {pending && !background && <div className={styles.summaryOverlay} role="status">Updating…</div>}
        {background && <p role="status">Updating the summary in the background…</p>}
        {job?.status === "failed" && <p role="status">Summary update is delayed. It will retry automatically.</p>}
      </div>

      <div className={styles.memories}>
        <MemoriesSection
          targetType="event"
          targetId={event.id}
          initial={event.annotations}
          contextLabel={`${eventDateOnlyLabel(event)} · ${event.title}`}
          onChanged={() => { if (event.narrativesEnabled) { setStarted(Date.now()); setJob((current) => ({ status: "pending", requestedVersion: (current?.requestedVersion ?? 0) + 1, completedVersion: current?.completedVersion ?? 0 })); } }}
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
