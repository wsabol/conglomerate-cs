import { Icon } from "../ui/Icon";
import { EmptyState } from "../state";
import type { EventDetailDTO } from "@shared/dto";
import styles from "./EventDetailView.module.css";

interface EventPromoPanelProps {
  event: EventDetailDTO;
}

export function EventPromoPanel({ event }: EventPromoPanelProps) {
  const promotionText = event.performance?.promotionText;
  const billingName = event.performance?.billingName;

  return (
    <>
      {billingName && billingName !== event.title && (
        <h4 className={styles.eventPromoHeading}>{billingName}</h4>
      )}

      {promotionText ? (
        <p className={styles.description}>{promotionText}</p>
      ) : (
        <EmptyState title="No event promo." icon="link" size="sm" />
      )}

      <hr className={styles.promoDivider} />

      <p className={styles.sectionInfoFooter}>
        <Icon name="info" size={16} />
        Text from the original promotional material for the event.
      </p>
    </>
  );
}
