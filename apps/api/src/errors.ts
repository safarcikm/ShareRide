import type { ErrorResponse } from "@shareride/contracts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type ErrorDetails = NonNullable<ErrorResponse["error"]["details"]>;

export interface ErrorExtras {
  readonly details?: ErrorDetails;
  readonly retryAfterSeconds?: number;
  readonly attemptsLeft?: number;
}

export function errorBody(code: string, message: string, details?: ErrorDetails): ErrorResponse {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

/** An error reply in the standard shape, with `Retry-After` when there is a wait. */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  extras: ErrorExtras = {},
) {
  if (extras.retryAfterSeconds !== undefined) {
    c.header("Retry-After", String(extras.retryAfterSeconds));
  }
  return c.json({ error: { code, message, ...extras } } satisfies ErrorResponse, status);
}
