export { sha256Hex } from "@shared/checksum";

/** Parse a Range header into R2 offset/length (supports `bytes=start-end`). */
export function parseRangeHeader(
  range: string | null,
  size: number,
): { offset: number; length: number } | null {
  if (!range) return null;
  const match = /^bytes=(\d+)-(\d*)$/i.exec(range.trim());
  if (!match) return null;
  const start = Number(match[1]);
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(end) || end < start) return null;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

/** Build Content-Range for a 206 response. */
export function contentRange(
  start: number,
  end: number,
  total: number,
): string {
  return `bytes ${start}-${end}/${total}`;
}
