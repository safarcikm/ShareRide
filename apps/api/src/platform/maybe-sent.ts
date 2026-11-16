/**
 * A send whose answer was lost after the provider may have taken it (a
 * timeout, a dropped connection, an answer out of shape). The worker never
 * tries it again, so nobody gets the same notification twice (R7.6).
 */
export class MaybeSent extends Error {
  override readonly name: string = "MaybeSent";
}

/** Connection errors that mean the request never left, so nothing was sent. */
const neverConnected = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** Whether a failed `fetch` never reached the provider, so trying again sends nothing twice. */
export function neverLeft(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  return typeof code === "string" && neverConnected.has(code);
}
