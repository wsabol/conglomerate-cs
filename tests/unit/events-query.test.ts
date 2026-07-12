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
});
