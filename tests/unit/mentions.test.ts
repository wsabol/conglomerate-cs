import { describe, expect, it } from "vitest";
import {
  extractPeopleIds,
  filterPeopleForMention,
  formatMention,
  getActiveMentionQuery,
  parseMentionSegments,
  parsePersonAliases,
} from "../../src/shared/mentions";

describe("formatMention + extractPeopleIds", () => {
  it("round-trips a single mention", () => {
    const token = formatMention("McIan", 42);
    expect(token).toBe("@[McIan](42)");
    expect(extractPeopleIds(`Solo by ${token} here.`)).toEqual([42]);
  });

  it("dedupes duplicate person IDs", () => {
    const token = formatMention("McIan", 42);
    expect(extractPeopleIds(`${token} and again ${token}`)).toEqual([42]);
  });

  it("extracts multiple people", () => {
    const body = `${formatMention("McIan", 1)} and ${formatMention("Brent", 2)}`;
    expect(extractPeopleIds(body)).toEqual([1, 2]);
  });

  it("ignores plain @foo without token syntax", () => {
    expect(extractPeopleIds("@foo said hello")).toEqual([]);
  });

  it("ignores invalid IDs", () => {
    expect(extractPeopleIds("@[Nobody](0) and @[Ghost](-1)")).toEqual([]);
  });
});

describe("parseMentionSegments", () => {
  it("splits mixed text and mentions", () => {
    const body = `Before ${formatMention("McIan", 42)} after`;
    expect(parseMentionSegments(body)).toEqual([
      { type: "text", text: "Before " },
      {
        type: "mention",
        text: "@[McIan](42)",
        displayName: "McIan",
        personId: 42,
      },
      { type: "text", text: " after" },
    ]);
  });

  it("returns one text segment when there are no mentions", () => {
    expect(parseMentionSegments("plain memory")).toEqual([
      { type: "text", text: "plain memory" },
    ]);
  });
});

describe("parsePersonAliases", () => {
  it("splits comma-separated aliases", () => {
    expect(parsePersonAliases("Mike, Mikey, Michael")).toEqual([
      "Mike",
      "Mikey",
      "Michael",
    ]);
  });

  it("returns an empty array for null", () => {
    expect(parsePersonAliases(null)).toEqual([]);
  });
});

describe("filterPeopleForMention", () => {
  const people = [
    { id: 1, displayName: "McIan", aliases: "Ian" },
    { id: 2, displayName: "Brent", aliases: null },
  ];

  it("matches display names", () => {
    expect(filterPeopleForMention("mc", people)).toEqual([people[0]]);
  });

  it("matches aliases", () => {
    expect(filterPeopleForMention("ian", people)).toEqual([people[0]]);
  });

  it("returns all people for an empty query", () => {
    expect(filterPeopleForMention("", people)).toEqual(people);
  });
});

describe("getActiveMentionQuery", () => {
  it("detects an active mention before the cursor", () => {
    const text = "Hello @Mc";
    expect(getActiveMentionQuery(text, text.length)).toEqual({
      query: "Mc",
      start: 6,
    });
  });

  it("returns null when not in a mention", () => {
    expect(getActiveMentionQuery("Hello world", 5)).toBeNull();
  });
});
