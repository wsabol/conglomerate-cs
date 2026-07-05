import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./Icon";
import styles from "./Pill.module.css";

interface PillProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Toggle chip - used for year/type filter controls. */
export function Pill({ children, active, onClick, className }: PillProps) {
  return (
    <button
      type="button"
      className={cn(styles.pill, active && styles.active, className)}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface TagProps {
  children: ReactNode;
  icon?: IconName;
  iconLabel?: string;
  className?: string;
}

/** Non-interactive metadata label (date, place, personnel...). */
export function Tag({ children, icon, iconLabel, className }: TagProps) {
  return (
    <span className={cn(styles.tag, className)}>
      {icon && <Icon name={icon} size={14} label={iconLabel} />}
      {children}
    </span>
  );
}
