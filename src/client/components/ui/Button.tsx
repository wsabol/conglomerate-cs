import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary"
  | "brass"
  | "orange"
  | "ghost"
  | "ghost-primary"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/** Shared class string so router <Link>s can look like buttons too. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  block = false,
): string {
  return cn(
    styles.button,
    styles[variant],
    size === "sm" && styles.sm,
    size === "lg" && styles.lg,
    block && styles.block,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(buttonClass(variant, size, block), className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}
