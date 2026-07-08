import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import styles from "./MediaLightbox.module.css";

export interface MediaLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  title?: string | null;
  caption?: string | null;
}

export function MediaLightbox({
  open,
  onClose,
  src,
  title,
  caption,
}: MediaLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const label = title ?? "Full-size image";

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className={styles.srOnly}>
          {label}
        </h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close image viewer"
        >
          <Icon name="close" />
        </button>
        <img className={styles.image} src={src} alt={label} />
        {caption && <p className={styles.caption}>{caption}</p>}
      </div>
    </div>,
    document.body,
  );
}
