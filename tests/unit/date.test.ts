import { describe, expect, it } from "vitest";
import { formatEventDate, normalizeTime } from "../../src/shared/date";

// Every example from PRD Sec: Dates & Times.
describe("formatEventDate", () => {
  it("exact date", () => {
    expect(formatEventDate("2011-05-14", null, "exact")).toBe("5/14/2011");
  });

  it("exact date with known time uses DATETIME_SHORT", () => {
    expect(formatEventDate("2011-05-14", "21:00", "exact")).toBe(
      "5/14/2011, 9:00 PM",
    );
  });

  it("month precision", () => {
    expect(formatEventDate("2011-05-01", null, "month")).toBe("May 2011");
  });

  it("semester precision (spring)", () => {
    expect(formatEventDate("2011-02-01", null, "semester")).toBe("Spring 2011");
  });

  it("semester precision (fall)", () => {
    expect(formatEventDate("2011-08-01", null, "semester")).toBe("Fall 2011");
  });

  it("year precision", () => {
    expect(formatEventDate("2011-01-01", null, "year")).toBe("2011");
  });

  it("approximate precision", () => {
    expect(formatEventDate("2011-05-14", null, "approximate")).toBe(
      "Around 5/14/2011",
    );
  });

  it("unknown precision", () => {
    expect(formatEventDate("2011-05-14", null, "unknown")).toBe("Unknown");
  });

  it("missing date is Unknown", () => {
    expect(formatEventDate(null, null, "exact")).toBe("Unknown");
  });
});

describe("normalizeTime", () => {
  it("parses 12h am/pm", () => {
    expect(normalizeTime("9:00 PM")).toBe("21:00");
    expect(normalizeTime("8:00 PM")).toBe("20:00");
    expect(normalizeTime("10:30 PM")).toBe("22:30");
  });

  it("passes through 24h", () => {
    expect(normalizeTime("21:00")).toBe("21:00");
  });

  it("returns null for empty/invalid", () => {
    expect(normalizeTime("")).toBeNull();
    expect(normalizeTime(null)).toBeNull();
    expect(normalizeTime("not a time")).toBeNull();
  });
});
