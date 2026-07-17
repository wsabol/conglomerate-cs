import { sha256Hex } from "@shared/checksum";

/** Stream an R2 object body through SHA-256 without loading it all into memory. */
export async function sha256HexFromStream(
  body: ReadableStream<Uint8Array>,
): Promise<string> {
  if (typeof DigestStream !== "undefined") {
    const digest = new DigestStream("SHA-256");
    await body.pipeTo(digest);
    const hashBuffer = await digest.digest;
    return [...new Uint8Array(hashBuffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return sha256Hex(merged.buffer);
}

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
