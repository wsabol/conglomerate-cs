import { MemoriesSection } from "../memory/MemoriesSection";
import { EmptyState } from "../state";
import { Button } from "../ui/Button";
import { eventDateOnlyLabel } from "../../lib/format";
import type { EventDetailDTO } from "@shared/dto";
import { EventMediaGallery } from "./EventMediaGallery";
import styles from "./EventDetailView.module.css";
import { useEffect, useState } from "react";
import { getSummaryStatus, retrySummary } from "../../lib/events";

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
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [pollFailures, setPollFailures] = useState(0);
  // A queued job found on page load was not started by this visit.
  const [started, setStarted] = useState<number | null>(null);
  // End the overlay even if a status request never settles.
  useEffect(() => {
    if (started === null) return;
    const timer = window.setTimeout(() => setStarted(null), Math.max(0, 30_000 - (Date.now() - started)));
    return () => window.clearTimeout(timer);
  }, [started]);
  useEffect(() => {
    setJob(event.summaryJob);
    if (!event.summaryJob || event.summaryJob.requestedVersion <= event.summaryJob.completedVersion) setStarted(null);
  }, [event.summaryJob]);
  useEffect(() => {
    if (!job || job.requestedVersion <= job.completedVersion ||
      (job.status === "failed" && job.errorCode === "QUEUE_EXPIRED")) return;
    if (document.hidden) {
      const resume = () => { if (!document.hidden) setJob((current) => current ? { ...current } : null); };
      document.addEventListener("visibilitychange", resume);
      return () => document.removeEventListener("visibilitychange", resume);
    }
    let cancelled = false;
    const delay = pollFailures > 0 ? Math.min(60_000, 15_000 * 2 ** Math.min(pollFailures - 1, 2))
      : job.status === "failed" || started === null || Date.now() - started > 30_000 ? 15_000 : 2_000;
    const timer = window.setTimeout(async () => {
      if (document.hidden) { setJob((current) => current ? { ...current } : null); return; }
      try {
        const next = await getSummaryStatus(event.slug);
        if (cancelled) return;
        setPollFailures(0);
        setJob(next.job);
        if (next.job?.status === "complete") { setStarted(null); onReload(); }
      } catch {
        if (cancelled) return;
        setStarted(null);
        setPollFailures((failures) => failures + 1);
      }
    }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [job, started, pollFailures, event.slug, onReload]);
  const pending = !!job && job.requestedVersion > job.completedVersion && job.status !== "failed";
  const foreground = pending && started !== null && Date.now() - started <= 30_000;
  const background = pending && !foreground;
  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const result = await retrySummary(event.slug);
      setJob(result.job);
      setStarted(Date.now());
    } catch {
      setRetryError("Could not queue the summary update. Try again.");
    } finally {
      setRetrying(false);
    }
  }
  return (
    <>
      <div className={styles.summaryRegion} aria-live="polite">
        <div className={foreground ? styles.summaryUpdating : undefined}>
          {event.summary ? <p className={styles.summary}>{event.summary}</p> : <EmptyState title="No summary yet." icon="document" size="sm" />}
        </div>
        {foreground && <div className={styles.summaryOverlay} role="status">Updating…</div>}
        {background && <p role="status">{job?.status === "processing" ? "Summary update is running in the background…" : "Summary update is queued."}</p>}
        {job?.status === "failed" && job.errorCode !== "QUEUE_EXPIRED" && <p role="status">{job.errorCode === "LEASE_EXPIRED" ? "Summary update is delayed; waiting to retry." : "Summary update is delayed. It will retry automatically."}</p>}
        {job?.status === "failed" && job.errorCode === "QUEUE_EXPIRED" && <div role="status">
          <p>The queued summary update expired. Your memories are still saved.</p>
          {isEditor && <Button type="button" size="sm" variant="ghost-primary" loading={retrying} onClick={() => void handleRetry()}>Retry summary update</Button>}
        </div>}
        {retryError && <p role="alert">{retryError}</p>}
      </div>

      <div className={styles.memories}>
        <MemoriesSection
          targetType="event"
          targetId={event.id}
          initial={event.annotations}
          contextLabel={`${eventDateOnlyLabel(event)} · ${event.title}`}
          onChanged={() => { if (event.narrativesEnabled) { setStarted(Date.now()); setJob((current) => ({ status: "pending", requestedVersion: (current?.requestedVersion ?? 0) + 1, completedVersion: current?.completedVersion ?? 0, errorCode: null })); } }}
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
