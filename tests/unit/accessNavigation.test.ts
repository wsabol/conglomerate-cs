import { describe, expect, it } from "vitest";
import { protectedDestination } from "../../src/shared/accessNavigation";

describe("protectedDestination", () => {
  it("preserves a protected deep link and its query", () => {
    expect(protectedDestination("/timeline?year=2024")).toBe("/timeline?year=2024");
  });

  it("falls back to the archive for external and public targets", () => {
    for (const next of ["https://other.example/", "//other.example/", "/welcome", "/signin", "/logged-out", "/auth/complete", "/cdn-cgi/access/logout", "/api/me"]) {
      expect(protectedDestination(next)).toBe("/");
    }
  });

});
