import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "../ui/Icon";
import { Button } from "../ui/Button";
import styles from "./state.module.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ width, height = "1rem", radius, className, style }: SkeletonProps) {
  return (
    <span
      className={cn(styles.skeleton, className)}
      aria-hidden="true"
      style={{ display: "block", width, height, borderRadius: radius, ...style }}
    />
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className={styles.centered} role="status" aria-live="polite">
      <span className={styles.spinner} />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

interface MessageProps {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}

export function EmptyState({ title, children, icon = "star", action }: MessageProps) {
  return (
    <div className={styles.message}>
      <Icon name={icon} size={40} className={styles.messageIcon} />
      <p className={styles.messageTitle}>{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className={styles.message} role="alert">
      <p className={cn(styles.messageTitle, styles.errorTitle)}>{title}</p>
      {message && <p>{message}</p>}
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
