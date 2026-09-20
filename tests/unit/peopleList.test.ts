import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPerson,
  invalidatePeopleList,
  listPeople,
} from "../../src/client/lib/people";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const peoplePayload = {
  results: [
    {
      id: 1,
      displayName: "Alex",
      personType: "friend",
      aliases: null,
      bio: null,
    },
  ],
};

describe("listPeople cache", () => {
  afterEach(() => {
    invalidatePeopleList();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reuses the first successful /api/people response", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return jsonResponse({ data: peoplePayload, message: "ok" });
    });

    const first = await listPeople();
    const second = await listPeople();

    expect(first).toEqual(peoplePayload);
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it("shares one in-flight request", async () => {
    let calls = 0;
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise<Response>((resolve) => {
          calls++;
          resolveFetch = resolve;
        }),
    );

    const first = listPeople();
    const second = listPeople();
    resolveFetch(jsonResponse({ data: peoplePayload, message: "ok" }));

    expect(await first).toEqual(peoplePayload);
    expect(await second).toEqual(peoplePayload);
    expect(calls).toBe(1);
  });

  it("retries after a failed fetch", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse({ data: null, message: "Unavailable." }, 400);
      }
      return jsonResponse({ data: peoplePayload, message: "ok" });
    });

    await expect(listPeople()).rejects.toThrow("Unavailable.");
    await expect(listPeople()).resolves.toEqual(peoplePayload);
    expect(calls).toBe(2);
  });

  it("refetches after createPerson succeeds", async () => {
    const created = {
      id: 2,
      displayName: "Casey",
      personType: null,
      aliases: null,
      bio: null,
    };
    let calls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return jsonResponse({ data: created, message: "Person created" }, 201);
      }
      const url = typeof input === "string" ? input : String(input);
      expect(url).toBe("/api/people");
      return jsonResponse({ data: peoplePayload, message: "ok" });
    });

    await listPeople();
    await createPerson({ displayName: "Casey" });
    await listPeople();
    expect(calls).toBe(3);
  });
});
