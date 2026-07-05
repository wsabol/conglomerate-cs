import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import styles from "./Card.module.css";

interface CardProps {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}

export function Card({ children, padded = true, className }: CardProps) {
  return (
    <div className={cn(styles.card, padded && styles.padded, className)}>
      {children}
    </div>
  );
}

/** Subtle golden section title (PRD prototype: Performance Detail). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>;
}
