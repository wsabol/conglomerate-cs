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
      throw err;
    }
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
