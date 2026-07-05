// Typed mirror of the CSS custom properties in tokens.css. Prefer CSS variables
// (var(--color-emerald)) in stylesheets; use this object where TS needs values.

export const colors = {
  bg: "#080A09",
  surface: "#171A18",
  raised: "#242825",
  text: "#F1E9DA",
  textSecondary: "#B7B0A2",
  emerald: "#078A70",
  brass: "#C49A47",
  orange: "#C64C27",
  magenta: "#8C4F78",
  violet: "#554B69",
} as const;

export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type BreakpointName = keyof typeof breakpoints;

export const fonts = {
  display: "var(--font-display)",
  body: "var(--font-body)",
  mono: "var(--font-mono)",
} as const;
