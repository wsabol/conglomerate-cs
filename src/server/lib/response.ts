import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiResponse, ListResult } from "@shared/types";

/** Success envelope with a data payload. */
export function ok<T>(
  c: Context,
  data: T,
  message: string,
  status: ContentfulStatusCode = 200,
) {
  return c.json<ApiResponse<T>>({ data, message }, status);
}

/** Success envelope for list endpoints ({ data: { results }, message }). */
export function okList<T>(
  c: Context,
  results: T[],
  message: string,
  status: ContentfulStatusCode = 200,
) {
  return c.json<ApiResponse<ListResult<T>>>(
    { data: { results }, message },
    status,
  );
}

/** Build an error envelope body (used by the error middleware). */
export function errorBody(
  message: string,
  details?: unknown,
): ApiResponse<unknown> {
  return { data: details ? { details } : {}, message };
}
