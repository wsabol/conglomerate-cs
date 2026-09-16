import { describe, expect, it } from "vitest";
import { assessEventConfidence, type ConfidenceInput, type ConfidenceSource } from "../../src/shared/confidence";
import { DATE_PRECISIONS } from "../../src/shared/types";
import { eventCreateSchema, eventUpdateSchema } from "../../src/shared/schemas/event";

const url = (value: string): ConfidenceSource => ({ sourceType: "url", url: value });
const text = (value: string): ConfidenceSource => ({ sourceType: "text", description: value });
const photo = (id: number): ConfidenceSource => ({ sourceType: "media", mediaId: id });
const base: ConfidenceInput = { eventType: "performance", eventDate: "2011-10-31", datePrecision: "exact", sources: [], eligibleMediaIds: [] };
const assess = (input: Partial<ConfidenceInput>) => assessEventConfidence({ ...base, ...input });
const first = url("https://example.com/show");
const second = url("https://example.com/post");

describe("automatic confidence", () => {
  it.each([
    [[], "low"],
    [[text("Calendar")], "low"],
    [[text("Calendar"), text("Diary")], "medium"],
    [[first], "medium"],
    [[first, text("Calendar")], "medium"],
    [[first, second], "high"],
  ] as const)("scores sources %j as %s", (sources, level) => {
    expect(assess({ sources }).level).toBe(level);
  });

  it.each(DATE_PRECISIONS)("respects %s precision", (datePrecision) => {
    const result = assess({ datePrecision, sources: [first, second] });
    expect(result.level).toBe(datePrecision === "exact" ? "high" : "medium");
    expect(result.reasons.includes("needs_exact_date")).toBe(datePrecision !== "exact");
  });

  it.each([null, undefined, "", "2011-02-29", "2012-02-30", "2011-13-01", "2011-01-00", "2011-1-01", "nonsense"])("rejects invalid/missing exact date %s", (eventDate) => {
    expect(assess({ eventDate, sources: [first, second] }).level).toBe("medium");
  });

  it("accepts a leap day", () => {
    expect(assess({ eventDate: "2012-02-29", sources: [first, second] }).level).toBe("high");
  });

  it.each([{ setlistText: "Song" }, { promotionText: "Concert announcement" }, { setlistText: "Song", promotionText: "Announcement" }])("allows performance details only alongside a source", (performance) => {
    expect(assess({ performance }).level).toBe("low");
    expect(assess({ performance, sources: [first] }).level).toBe("high");
    expect(assess({ performance, sources: [first], datePrecision: "year" }).level).toBe("medium");
    expect(assess({ performance, sources: [first], eventType: "party" }).level).toBe("medium");
  });

  it("ignores blank details and normalizes text duplicates", () => {
    expect(assess({ performance: { setlistText: "  ", promotionText: "\n" }, sources: [first] }).level).toBe("medium");
    expect(assess({ sources: [text(" Will's   Calendar "), text("will's calendar"), text("\n")] }).level).toBe("low");
  });

  it("normalizes URL fragments, host and default ports, preserving query parameters", () => {
    expect(assess({ sources: [url("HTTPS://EXAMPLE.COM:443/show#date"), url(" https://example.com/show#poster ")] }).level).toBe("medium");
    expect(assess({ sources: [url("https://example.com/?post=1"), url("https://example.com/?post=2")] }).level).toBe("high");
  });

  it("ignores invalid URLs and non-HTTP protocols", () => {
    expect(assess({ sources: [url("invalid"), url("ftp://example.com"), url("javascript:alert(1)"), url("")] }).level).toBe("low");
  });

  it("counts only distinct eligible media explicitly cited as sources", () => {
    expect(assess({ sources: [photo(1)], eligibleMediaIds: [1, 2] }).level).toBe("medium");
    expect(assess({ sources: [photo(1), photo(1)], eligibleMediaIds: [1] }).level).toBe("medium");
    expect(assess({ sources: [photo(1), photo(2)], eligibleMediaIds: [1] }).level).toBe("medium");
    expect(assess({ sources: [photo(1), first], eligibleMediaIds: [1] }).level).toBe("high");
    expect(assess({ sources: [photo(1)], eligibleMediaIds: [] }).level).toBe("low");
    expect(assess({ eligibleMediaIds: [1, 2] }).level).toBe("low");
  });

  it("explains missing evidence and supporting facts", () => {
    expect(assess({ eventDate: null }).reasons).toEqual([
      "needs_exact_date", "needs_url_or_media_source", "needs_second_source_or_performance_details",
    ]);
    expect(assess({ sources: [first, second] })).toEqual({ level: "high", reasons: ["exact_date", "url_or_media_source", "multiple_sources"] });
    expect(assess({ sources: [first], eventType: "party" }).reasons).toContain("needs_second_source");
  });

  it("strips client confidence and rejects confidence-only patches", () => {
    expect(eventCreateSchema.parse({ name: "Show", confidence: "high" })).not.toHaveProperty("confidence");
    expect(eventUpdateSchema.parse({ summary: "Notes", confidence: "high" })).toEqual({ summary: "Notes" });
    expect(eventUpdateSchema.safeParse({ confidence: "high" }).success).toBe(false);
  });
});
