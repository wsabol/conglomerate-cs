import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorDetail } from "@shared/types";

/**
 * Application error that maps cleanly onto the response envelope. Route code
 * throws these; the error middleware serializes them (never leaking stacks).
 */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly details?: ApiErrorDetail[];

  constructor(
    status: ContentfulStatusCode,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: ApiErrorDetail[]) =>
  new ApiError(400, message, details);

export const unauthorized = (message = "Authentication required.") =>
  new ApiError(401, message);

export const forbidden = (message = "You do not have access to do that.") =>
  new ApiError(403, message);

export const notFound = (message = "Not found.") => new ApiError(404, message);

export const conflict = (message: string, details?: ApiErrorDetail[]) =>
  new ApiError(409, message, details);
