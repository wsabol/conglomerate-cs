import { describe, expect, it } from "vitest";
import { eventUpdateSchema } from "../../src/shared/schemas/event";

describe("eventUpdateSchema", () => {
  it("does not inject empty relation arrays when only one field is sent", () => {
    const parsed = eventUpdateSchema.parse({
      people: [{ personId: 1, relationshipType: "performer" }],
    });
    expect(parsed.people).toHaveLength(1);
    expect(parsed.acts).toBeUndefined();
    expect(parsed.sources).toBeUndefined();
  });

  it("does not inject scalar create defaults when only summary is sent", () => {
    const parsed = eventUpdateSchema.parse({ summary: "Updated summary." });
    expect(parsed.summary).toBe("Updated summary.");
    expect(parsed.eventType).toBeUndefined();
    expect(parsed.datePrecision).toBeUndefined();
    expect(parsed.confidence).toBeUndefined();
    expect(parsed.people).toBeUndefined();
    expect(parsed.acts).toBeUndefined();
    expect(parsed.sources).toBeUndefined();
  });
});
