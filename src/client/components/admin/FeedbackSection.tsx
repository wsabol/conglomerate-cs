import { useCallback, useEffect, useState } from "react";
import type { FeedbackDTO } from "@shared/dto";
import { Select } from "../form";
import { Button, buttonClass } from "../ui/Button";
import { Spinner } from "../state";
import { createFeedbackGitHubIssue, listFeedback, resetFeedbackGitHubIssue, retryFeedbackNotification, setFeedbackReviewed } from "../../lib/feedback";
import styles from "./FeedbackSection.module.css";
import { DateTime } from "luxon";

const categoryLabels: Record<FeedbackDTO["category"], string> = {
  bug: "Bug",
  suggestion: "Suggestion",
  praise_other: "Praise / other",
};

export function FeedbackSection() {
  const [category, setCategory] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [reports, setReports] = useState<FeedbackDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const result = await listFeedback({ category: category || undefined, reviewStatus: reviewStatus || undefined });
      setReports(result.results);
      setHasMore(result.results.length === 50);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load feedback.");
    } finally {
      setLoading(false);
    }
  }, [category, reviewStatus]);

  useEffect(() => { setLoading(true); void reload(); }, [reload]);

  async function loadMore() {
    const beforeId = reports.at(-1)?.id;
    if (!beforeId) return;
    setLoadingMore(true);
    try {
      const result = await listFeedback({ category: category || undefined, reviewStatus: reviewStatus || undefined, beforeId });
      setReports((current) => [...current, ...result.results]);
      setHasMore(result.results.length === 50);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more feedback.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function act(id: number, action: () => Promise<FeedbackDTO>) {
    setBusyId(id);
    setError("");
    try {
      await action();
      await reload();
    } catch (reason) {
      await reload();
      setError(reason instanceof Error ? reason.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.section} aria-label="Feedback reports">
      <div className={styles.filters}>
        <Select label="Type" value={category} onChange={(event) => setCategory(event.target.value)} options={[
          { value: "", label: "All types" },
          { value: "bug", label: "Bugs" },
          { value: "suggestion", label: "Suggestions" },
          { value: "praise_other", label: "Praise / other" },
        ]} />
        <Select label="Review" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} options={[
          { value: "", label: "All reports" },
          { value: "open", label: "Open" },
          { value: "reviewed", label: "Reviewed" },
        ]} />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <Spinner label="Loading feedback" /> : reports.length === 0 ? <p>No feedback found.</p> : (
        <><ul className={styles.list}>
          {reports.map((report) => (
            <li className={styles.report} key={report.id}>
              <div className={styles.meta}>
                <strong>#{report.id} · {categoryLabels[report.category]}</strong>
                <span>{DateTime.fromSQL(report.createdOn).toLocaleString(DateTime.DATETIME_SHORT)} · {report.submitterEmail}</span>
              </div>
              <p className={styles.message}>{report.message}</p>
              {report.whatHappened && <p className={styles.message}><strong>What happened:</strong> {report.whatHappened}</p>}
              {report.reproductionSteps && <p className={styles.message}><strong>How to reproduce:</strong> {report.reproductionSteps}</p>}
              <p className={styles.details}>Page: {report.pagePath}</p>
              <p className={styles.details}>Notification: {report.notificationStatus} · Review: {report.reviewStatus}</p>
              {report.issueStatus === "creating" && <p className={styles.warning}>GitHub status is uncertain. Check the repository for feedback #{report.id} before taking further action.</p>}
              <div className={styles.actions}>
                <Button type="button" size="sm" variant="ghost" disabled={busyId !== null}
                  onClick={() => void act(report.id, () => setFeedbackReviewed(report.id, report.reviewStatus === "open" ? "reviewed" : "open"))}>
                  Mark {report.reviewStatus === "open" ? "reviewed" : "open"}
                </Button>
                {report.notificationStatus === "failed" && <Button type="button" size="sm" variant="ghost" disabled={busyId !== null}
                  onClick={() => void act(report.id, () => retryFeedbackNotification(report.id))}>Retry email</Button>}
                {report.issueUrl && (
                  <a className={buttonClass("ghost-primary", "sm")} href={report.issueUrl} target="_blank" rel="noopener noreferrer">
                    View GitHub issue
                  </a>
                )}
                {report.issueStatus === "none" && <Button type="button" size="sm" disabled={busyId !== null}
                  onClick={() => void act(report.id, () => createFeedbackGitHubIssue(report.id))}>Create GitHub issue</Button>}
                {report.issueStatus === "creating" && <Button type="button" size="sm" variant="ghost" disabled={busyId !== null}
                  onClick={() => {
                    if (window.confirm(`Check GitHub for feedback #${report.id} first. Reset this attempt only if no issue was created.`)) {
                      void act(report.id, () => resetFeedbackGitHubIssue(report.id));
                    }
                  }}>Reset issue attempt</Button>}
              </div>
            </li>
          ))}
        </ul>
        {hasMore && <div className={styles.more}><Button type="button" variant="ghost" loading={loadingMore} onClick={() => void loadMore()}>Load older feedback</Button></div>}
        </>
      )}
    </section>
  );
}
