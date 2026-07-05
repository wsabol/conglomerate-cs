import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiError } from "../lib/errors";
import { errorBody } from "../lib/response";

/** Single error boundary that maps every failure onto the response envelope. */
export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json(errorBody(err.message, err.details), err.status);
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      message: [issue.path.join("."), issue.message]
        .filter(Boolean)
        .join(": "),
    }));
    return c.json(errorBody("Validation failed.", details), 400);
  }

  if (err instanceof HTTPException) {
    return c.json(
      errorBody(err.message || "Request failed."),
      err.status as ContentfulStatusCode,
    );
  }

  console.error("Unhandled error:", err);
  return c.json(errorBody("Something went wrong."), 500);
}

export function notFoundHandler(c: Context) {
  return c.json(errorBody("Not found."), 404);
}
