/** Build a unique R2 object key for an upload. */
export function mediaObjectKey(
  mediaId: number,
  filename: string,
  variant: "original" | "display" | "thumb" = "original",
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const suffix =
    variant === "original"
      ? safe
      : variant === "display"
        ? "display.webp"
        : "thumb.webp";
  return `media/${mediaId}/${suffix}`;
}
