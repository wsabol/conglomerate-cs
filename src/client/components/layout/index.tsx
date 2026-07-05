import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "../../lib/cn";
import styles from "./layout.module.css";

type SpaceStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const gap = (step?: SpaceStep) =>
  step ? `var(--space-${step})` : undefined;

interface ContainerProps {
  children: ReactNode;
  width?: "default" | "narrow" | "wide";
  className?: string;
  as?: ElementType;
}

export function Container({
  children,
  width = "default",
  className,
  as: As = "div",
}: ContainerProps) {
  return (
    <As
      className={cn(
        styles.container,
        width === "narrow" && styles.narrow,
        width === "wide" && styles.wide,
        className,
      )}
    >
      {children}
    </As>
  );
}

interface StackProps {
  children: ReactNode;
  gap?: SpaceStep;
  align?: CSSProperties["alignItems"];
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
}

export function Stack({
  children,
  gap: g = 4,
  align,
  className,
  style,
  as: As = "div",
}: StackProps) {
  return (
    <As
      className={cn(styles.stack, className)}
      style={{ gap: gap(g), alignItems: align, ...style }}
    >
      {children}
    </As>
  );
}

interface RowProps extends StackProps {
  wrap?: boolean;
  justify?: CSSProperties["justifyContent"];
}

export function Row({
  children,
  gap: g = 3,
  align = "center",
  justify,
  wrap,
  className,
  style,
  as: As = "div",
}: RowProps) {
  return (
    <As
      className={cn(styles.row, wrap && styles.wrap, className)}
      style={{ gap: gap(g), alignItems: align, justifyContent: justify, ...style }}
    >
      {children}
    </As>
  );
}

interface GridProps {
  children: ReactNode;
  min?: number;
  className?: string;
  style?: CSSProperties;
}

export function Grid({ children, min = 260, className, style }: GridProps) {
  return (
    <div
      className={cn(styles.grid, className)}
      style={{ ["--grid-min" as string]: `${min}px`, ...style }}
    >
      {children}
    </div>
  );
}

interface SidebarLayoutProps {
  children: ReactNode;
  aside: ReactNode;
  side?: "left" | "right";
  width?: number;
  className?: string;
}

export function SidebarLayout({
  children,
  aside,
  side = "right",
  width = 320,
  className,
}: SidebarLayoutProps) {
  return (
    <div
      className={cn(
        styles.sidebarLayout,
        side === "left" && styles.sidebarLeft,
        className,
      )}
      style={{ ["--sidebar-width" as string]: `${width}px` }}
    >
      {side === "left" ? (
        <>
          <aside>{aside}</aside>
          <div>{children}</div>
        </>
      ) : (
        <>
          <div>{children}</div>
          <aside>{aside}</aside>
        </>
      )}
    </div>
  );
}
