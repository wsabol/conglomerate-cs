import type { ReactNode } from "react";
import type { Confidence } from "@shared/types";
import { Icon, type IconName } from "./Icon";
import styles from "./MetaItem.module.css";

interface MetaItemProps {
  icon: IconName;
  iconLabel: string;
  children?: ReactNode;
  tone?: Confidence | "default";
}

/** Inline metadata label with optional confidence tone coloring. */
export function MetaItem({
  icon,
  iconLabel,
  children,
  tone = "default",
}: MetaItemProps) {
  children = children ?? iconLabel;
  return (
    <span
      className={styles.metaItem}
      data-tone={tone === "default" ? undefined : tone}
    >
      <Icon name={icon} size={14} label={iconLabel} className={styles.metaIcon} />
      {children}
    </span>
  );
}
