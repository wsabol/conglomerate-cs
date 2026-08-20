import type { ApiResponse } from "@shared/types";

/** Error thrown for non-2xx API responses, carrying the envelope message. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

const RETRY_DELAY_MS = 300;
const ACCESS_URL_RE = /cloudflareaccess\.com|\/cdn-cgi\/access/i;

interface BrowserWindow {
  location: {
    assign(url: string): void;
    reload(): void;
  };
}

function getBrowserWindow(): BrowserWindow | undefined {
  return (globalThis as typeof globalThis & { window?: BrowserWindow }).window;
}

function isCloudflareAccessUrl(url: string): boolean {
  return ACCESS_URL_RE.test(url);
}

function isAccessChallengeResponse(res: Response): boolean {
  if (isCloudflareAccessUrl(res.url)) return true;
  const contentType = res.headers.get("content-type") ?? "";
  return contentType.includes("text/html");
}

/**
 * Top-level navigation when Cloudflare Access intercepts a request.
 * Exported as an object so tests can spy on `redirect` (same-module calls
 * would not go through a stubbed named export).
 */
export const accessNavigation = {
  redirect(url?: string): void {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return;
    if (url && isCloudflareAccessUrl(url)) {
      browserWindow.location.assign(url);
      return;
    }
    browserWindow.location.reload();
  },
};

function redirectToAccess(res?: Response): void {
  const url = res?.url;
  accessNavigation.redirect(
    url && isCloudflareAccessUrl(url) ? url : undefined,
  );
}

/** CORS hides Access's 302; a manual-redirect probe to `/` makes it visible. */
async function redirectIfAccessChallengeHidden(): Promise<void> {
  try {
    const probeInit: RequestInit & { credentials: "same-origin" } = {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "same-origin",
    };
    const res = await fetch(`/?_access_check=${Date.now()}`, probeInit);
    if (
      String(res.type) === "opaqueredirect" ||
      res.status === 302 ||
      isCloudflareAccessUrl(res.url)
    ) {
      redirectToAccess(res);
    }
  } catch {
    // Offline or blocked — do not reload.
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof ApiClientError) {
    return err.status >= 500 || err.status === 429;
  }
  return true;
}

async function fetchEnvelope<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });

  if (isAccessChallengeResponse(res)) {
    redirectToAccess(res);
    throw new ApiClientError("Authentication required.", 401);
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    if (!res.ok) throw new ApiClientError("Request failed.", res.status);
    throw new ApiClientError("Unexpected server response.", res.status);
  }

  if (!res.ok) {
    const details = (body?.data as { details?: unknown } | null)?.details;
    throw new ApiClientError(
      body?.message ?? "Request failed.",
      res.status,
      details,
    );
  }

  return body.data as T;
}

/** Fetch a JSON API endpoint and unwrap the `{ data, message }` envelope. */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? 2 : 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetchEnvelope<T>(path, init);
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1 && isRetryable(err)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      break;
    }
  }

  if (!(lastError instanceof ApiClientError)) {
    await redirectIfAccessChallengeHidden();
  }

  throw lastError;
}

/** Build a query string from a params object, skipping empty values. */
export function toQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}
