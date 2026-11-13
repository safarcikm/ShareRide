export interface AddressSources {
  /** The address of the TCP connection. */
  readonly remote: string | undefined;
  /** The X-Forwarded-For header. */
  readonly forwardedFor: string | undefined;
  /** True only behind our own load balancer, which appends to X-Forwarded-For. */
  readonly trustProxy: boolean;
}

/**
 * The client's IP address, for per-address limits (rule R1.3). Behind a
 * trusted proxy it is the last X-Forwarded-For entry, the one the proxy
 * added; earlier entries come from the client and can be forged.
 */
export function clientAddress(sources: AddressSources): string {
  if (sources.trustProxy && sources.forwardedFor !== undefined) {
    const last = sources.forwardedFor.split(",").at(-1)?.trim();
    if (last !== undefined && last !== "") return last;
  }
  return sources.remote ?? "unknown";
}
