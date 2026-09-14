import { describe, expect, it } from "vitest";
import { eventsQuerySchema } from "../../src/shared/schemas/query";

describe("eventsQuerySchema", () => {
  it("accepts an optional limit", () => {
    expect(eventsQuerySchema.parse({ limit: "4" })).toMatchObject({ limit: 4 });
  });

  it("rejects limits outside the allowed range", () => {
    expect(() => eventsQuerySchema.parse({ limit: "0" })).toThrow();
    expect(() => eventsQuerySchema.parse({ limit: "501" })).toThrow();
  });

  it("accepts compatible event group and type filters", () => {
    expect(
      eventsQuerySchema.parse({
        event_group: "non_performance",
        event_type: "party",
      }),
    ).toMatchObject({ event_group: "non_performance", event_type: "party" });
  });

  it("rejects contradictory event group and type filters", () => {
    expect(() =>
      eventsQuerySchema.parse({
        event_group: "performance",
        event_type: "party",
      }),
    ).toThrow();
    expect(() =>
      eventsQuerySchema.parse({
        event_group: "non_performance",
        event_type: "performance",
      }),
    ).toThrow();
  });
});
