import { describe, expect, it } from "vitest";
import {
  eventCreateSchema,
  eventUpdateSchema,
} from "../../src/shared/schemas/event";

describe("eventCreateSchema", () => {
  it("rejects performance details and billed acts for non-performance events", () => {
    expect(
      eventCreateSchema.safeParse({
        name: "Party",
        eventType: "party",
        performance: { promotionText: "Come celebrate" },
      }).success,
    ).toBe(false);
    expect(
      eventCreateSchema.safeParse({
        name: "Reunion",
        eventType: "reunion",
        acts: [{ name: "The Conglomerate", billingRole: "headliner" }],
      }).success,
    ).toBe(false);
  });

  it("allows performance details and billed acts for performances", () => {
    expect(
      eventCreateSchema.safeParse({
        name: "Show",
        eventType: "performance",
        performance: { setlistText: "The Lick" },
        acts: [{ name: "The Conglomerate", billingRole: "headliner" }],
      }).success,
    ).toBe(true);
  });
});

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
    expect(parsed).not.toHaveProperty("confidence");
    expect(parsed.people).toBeUndefined();
    expect(parsed.acts).toBeUndefined();
    expect(parsed.sources).toBeUndefined();
  });

  it("rejects performance details and billed acts with an explicit non-performance type", () => {
    expect(
      eventUpdateSchema.safeParse({
        eventType: "party",
        performance: { setlistText: "A song" },
      }).success,
    ).toBe(false);
    expect(
      eventUpdateSchema.safeParse({
        eventType: "recording",
        acts: [{ name: "The Conglomerate", billingRole: "headliner" }],
      }).success,
    ).toBe(false);
  });

  it("allows contextual performance patches when event type is omitted", () => {
    expect(
      eventUpdateSchema.safeParse({
        performance: { setlistText: "Updated song" },
      }).success,
    ).toBe(true);
  });
});
