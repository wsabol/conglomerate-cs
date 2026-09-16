import type { Confidence, DatePrecision, EventType, SourceType } from "./types";

export type ConfidenceReason =
  | "exact_date"
  | "url_or_media_source"
  | "multiple_sources"
  | "performance_details"
  | "multiple_text_sources"
  | "needs_exact_date"
  | "needs_url_or_media_source"
  | "needs_second_source"
  | "needs_second_source_or_performance_details";

export interface ConfidenceAssessment {
  level: Confidence;
  reasons: ConfidenceReason[];
}

export interface ConfidenceSource {
  sourceType: SourceType;
  url?: string | null;
  description?: string | null;
  mediaId?: number | null;
}

export interface ConfidenceInput {
  eventType: EventType;
  eventDate?: string | null;
  datePrecision: DatePrecision;
  sources: readonly ConfidenceSource[];
  /** Resolved by the server: only existing, published, non-deleted media. */
  eligibleMediaIds: readonly number[];
  performance?: { setlistText?: string | null; promotionText?: string | null } | null;
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Measures recorded evidence, not the truth of a source's contents. Never fetches URLs. */
export function assessEventConfidence(input: ConfidenceInput): ConfidenceAssessment {
  const urls = new Set<string>();
  const mediaIds = new Set<number>();
  const texts = new Set<string>();
  const eligible = new Set(input.eligibleMediaIds);
  for (const source of input.sources) {
    if (source.sourceType === "url" && source.url) {
      try {
        const url = new URL(source.url.trim());
        if (url.protocol !== "https:" && url.protocol !== "http:") continue;
        url.hash = "";
        urls.add(url.href);
      } catch { /* Invalid legacy URLs provide no evidence. */ }
    } else if (source.sourceType === "media" && source.mediaId != null) {
      if (eligible.has(source.mediaId)) mediaIds.add(source.mediaId);
    } else if (source.sourceType === "text") {
      const text = source.description?.trim().replace(/\s+/g, " ").toLowerCase();
      if (text) texts.add(text);
    }
  }
  const exact = input.datePrecision === "exact" && isValidDate(input.eventDate);
  const sourceCount = urls.size + mediaIds.size;
  const performanceDetails = input.eventType === "performance" && Boolean(
    input.performance?.setlistText?.trim() || input.performance?.promotionText?.trim(),
  );
  const secondSignal = sourceCount >= 2 || performanceDetails;
  const level: Confidence = exact && sourceCount >= 1 && secondSignal
    ? "high"
    : sourceCount >= 1 || texts.size >= 2 ? "medium" : "low";
  const reasons: ConfidenceReason[] = [];
  if (exact) reasons.push("exact_date");
  if (sourceCount > 0) reasons.push("url_or_media_source");
  if (sourceCount >= 2) reasons.push("multiple_sources");
  if (performanceDetails && sourceCount > 0) reasons.push("performance_details");
  if (texts.size >= 2) reasons.push("multiple_text_sources");
  if (!exact) reasons.push("needs_exact_date");
  if (sourceCount === 0) reasons.push("needs_url_or_media_source");
  if (!secondSignal) reasons.push(input.eventType === "performance"
    ? "needs_second_source_or_performance_details" : "needs_second_source");
  return { level, reasons };
}

export const CONFIDENCE_REASON_LABELS: Record<ConfidenceReason, string> = {
  exact_date: "An exact date is recorded.",
  url_or_media_source: "A supporting URL or published media source is recorded.",
  multiple_sources: "At least two distinct URL or media sources are recorded.",
  performance_details: "A setlist or promotional text provides additional support.",
  multiple_text_sources: "At least two distinct text sources are recorded.",
  needs_exact_date: "Add an exact date to reach high confidence.",
  needs_url_or_media_source: "Add a supporting URL or media source.",
  needs_second_source: "Add a second distinct URL or media source to reach high confidence.",
  needs_second_source_or_performance_details: "Add another URL or media source, a setlist, or promotional text to reach high confidence.",
};
