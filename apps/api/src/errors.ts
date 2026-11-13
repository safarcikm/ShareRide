import type { ErrorResponse } from "@shareride/contracts";

export function errorBody(
  code: string,
  message: string,
  details?: NonNullable<ErrorResponse["error"]["details"]>,
): ErrorResponse {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
