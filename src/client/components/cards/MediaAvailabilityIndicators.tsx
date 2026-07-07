import { Icon, type IconName } from "../ui/Icon";
import { cn } from "../../lib/cn";
import type { MediaAvailabilityDTO } from "@shared/dto";
import styles from "./MediaAvailabilityIndicators.module.css";

export type MediaIndicatorType = "photo" | "video" | "audio" | "setlist";

const INDICATORS: {
  type: MediaIndicatorType;
  icon: IconName;
  label: string;
}[] = [
  { type: "photo", icon: "photo", label: "Has photos" },
  { type: "video", icon: "video", label: "Has video" },
  { type: "audio", icon: "audio", label: "Has audio" },
  { type: "setlist", icon: "document", label: "Has setlist" },
];

const DEFAULT_TYPES: MediaIndicatorType[] = [
  "photo",
  "video",
  "audio",
  "setlist",
];

interface MediaAvailabilityIndicatorsProps {
  media: MediaAvailabilityDTO;
  variant: "overlay" | "inline";
  types?: MediaIndicatorType[];
}

export function MediaAvailabilityIndicators({
  media,
  variant,
  types = DEFAULT_TYPES,
}: MediaAvailabilityIndicatorsProps) {
  const visible = INDICATORS.filter(
    ({ type }) => types.includes(type) && media[type],
  );

  if (visible.length === 0) return null;

  return (
    <div className={cn(styles.root, styles[variant])}>
      {visible.map(({ type, icon, label }) => (
        <span key={type} className={styles.item}>
          <Icon name={icon} size={14} label={label} />
        </span>
      ))}
    </div>
  );
}
