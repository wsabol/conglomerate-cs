import { useEffect, useState, type FormEvent } from "react";
import { feedbackCreateSchema, type FeedbackCreateInput } from "@shared/schemas/feedback";
import { Select, TextArea } from "../form";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { submitFeedback } from "../../lib/feedback";
import { zodFieldErrors } from "../../lib/zodErrors";
import styles from "./FeedbackModal.module.css";

export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory("");
    setMessage("");
    setWhatHappened("");
    setReproductionSteps("");
    setErrors({});
    setSubmitError("");
    setSubmitted(false);
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    const parsed = feedbackCreateSchema.safeParse({
      category,
      message,
      whatHappened,
      reproductionSteps,
      pagePath: window.location.pathname,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await submitFeedback(parsed.data as FeedbackCreateInput);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not submit feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Give feedback" initialFocusSelector="select">
      {submitted ? (
        <div className={styles.form}>
          <p className={styles.success} role="status">Thank you. Your feedback was received.</p>
          <div className={styles.actions}><Button type="button" onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Select
            label="Feedback type"
            required
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Choose a type"
            options={[
              { value: "bug", label: "Something is broken" },
              { value: "suggestion", label: "I have a suggestion" },
              { value: "praise_other", label: "Praise or other feedback" },
            ]}
            error={errors.category}
          />
          <TextArea
            label="Your feedback"
            required
            value={message}
            maxLength={5000}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what's on your mind"
            error={errors.message}
          />
          {category === "bug" && (
            <>
              <TextArea label="What happened?" hint="Optional" value={whatHappened} maxLength={2000}
                onChange={(event) => setWhatHappened(event.target.value)} error={errors.whatHappened} />
              <TextArea label="How can we reproduce it?" hint="Optional" value={reproductionSteps} maxLength={2000}
                onChange={(event) => setReproductionSteps(event.target.value)} error={errors.reproductionSteps} />
            </>
          )}
          <p className={styles.hint}>We’ll include the page you’re viewing to help us understand your feedback.</p>
          {submitError && <p className={styles.error} role="alert">{submitError}</p>}
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>Send feedback</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
