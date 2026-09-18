import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  ApiClientError,
  accessNavigation,
} from "../../src/client/lib/api";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(url: string, redirected = false): Response {
  const res = new Response("<html>login</html>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  Object.defineProperty(res, "url", { value: url });
  if (redirected) {
    Object.defineProperty(res, "redirected", { value: true });
  }
  return res;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return String(input);
  return input.url;
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves the current archive URL when sending an expired session to welcome", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/timeline", search: "?year=2024", assign },
    });

    accessNavigation.redirect();

    expect(assign).toHaveBeenCalledWith("/welcome?next=%2Ftimeline%3Fyear%3D2024");
  });

  it("retries GET requests once on 503", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse({ data: null, message: "Unavailable." }, 503);
      }
      return jsonResponse({ data: { ok: true }, message: "ok" }, 200);
    });

    const data = await apiFetch<{ ok: boolean }>("/api/health");
    expect(calls).toBe(2);
    expect(data.ok).toBe(true);
  });

  it("does not retry POST requests", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return jsonResponse({ data: null, message: "Unavailable." }, 503);
    });

    await expect(
      apiFetch("/api/events", { method: "POST", body: "{}" }),
    ).rejects.toBeInstanceOf(ApiClientError);
    expect(calls).toBe(1);
  });

  it("does not retry 400 responses", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return jsonResponse({ data: null, message: "Validation failed." }, 400);
    });

    await expect(apiFetch("/api/events")).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it("opens welcome when fetch follows an Access login redirect", async () => {
    const redirect = vi
      .spyOn(accessNavigation, "redirect")
      .mockImplementation(() => {});
    const accessUrl =
      "https://wsabol-team.cloudflareaccess.com/cdn-cgi/access/login/app";
    vi.stubGlobal("fetch", async () => htmlResponse(accessUrl, true));

    await expect(apiFetch("/api/me")).rejects.toMatchObject({ status: 401 });
    expect(redirect).toHaveBeenCalledWith();
  });

  it("opens welcome when the response is HTML instead of JSON", async () => {
    const redirect = vi
      .spyOn(accessNavigation, "redirect")
      .mockImplementation(() => {});
    vi.stubGlobal("fetch", async () =>
      htmlResponse("https://example.test/api/me"),
    );

    await expect(apiFetch("/api/me")).rejects.toMatchObject({ status: 401 });
    expect(redirect).toHaveBeenCalledWith();
  });

  it("opens welcome on a JSON 401 from the app", async () => {
    const redirect = vi
      .spyOn(accessNavigation, "redirect")
      .mockImplementation(() => {});
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ data: null, message: "Authentication required." }, 401),
    );

    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      status: 401,
      message: "Authentication required.",
    });
    expect(redirect).toHaveBeenCalledWith();
  });

  it("probes for a hidden Access 302 when fetch fails with a network error", async () => {
    const redirect = vi
      .spyOn(accessNavigation, "redirect")
      .mockImplementation(() => {});
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (urlOf(input).includes("_access_check")) {
        return new Response(null, {
          status: 302,
          headers: {
            Location:
              "https://wsabol-team.cloudflareaccess.com/cdn-cgi/access/login/app",
          },
        });
      }
      throw new TypeError("Failed to fetch");
    });

    await expect(apiFetch("/api/me")).rejects.toBeInstanceOf(TypeError);
    expect(redirect).toHaveBeenCalled();
  });

  it("does not reload on a network error when the Access probe is not a redirect", async () => {
    const redirect = vi
      .spyOn(accessNavigation, "redirect")
      .mockImplementation(() => {});
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (urlOf(input).includes("_access_check")) {
        return jsonResponse({ data: null, message: "ok" }, 200);
      }
      throw new TypeError("Failed to fetch");
    });

    await expect(apiFetch("/api/me")).rejects.toBeInstanceOf(TypeError);
    expect(redirect).not.toHaveBeenCalled();
  });
});
