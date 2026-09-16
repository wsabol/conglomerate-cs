import { CONFIDENCE_REASON_LABELS, type ConfidenceAssessment } from "@shared/confidence";
import { MetaItem } from "../ui/MetaItem";
import styles from "./EventConfidence.module.css";

export function EventConfidence({ assessment }: { assessment: ConfidenceAssessment }) {
  return (
    <section className={styles.section} aria-label="Event confidence">
      <MetaItem icon={`confidence-${assessment.level}`} tone={assessment.level} iconLabel="Confidence">
        {assessment.level[0].toUpperCase() + assessment.level.slice(1)} confidence
      </MetaItem>
      <p>
      The strength of this event's evidence is <strong>{assessment.level[0].toUpperCase() + assessment.level.slice(1)}</strong>:
      </p>
      <ul>{assessment.reasons.map((reason) => (
        <li key={reason}>{CONFIDENCE_REASON_LABELS[reason]}</li>
      ))}</ul>
    </section>
  );
}
