import { isIP } from "node:net";

export interface AddressSources {
  /** The address of the TCP connection. */
  readonly remote: string | undefined;
  /** The X-Forwarded-For header. */
  readonly forwardedFor: string | undefined;
  /**
   * How many proxies in front of the API each append one entry to
   * X-Forwarded-For (TRUST_PROXY). On Render it is 2: Cloudflare appends the
   * client, then Render's proxy appends the Cloudflare edge.
   */
  readonly trustedProxies: number;
}

export interface ClientAddress {
  readonly address: string;
  /** "connection" when trusted proxies were expected but their entry was not usable. */
  readonly source: "proxy" | "connection";
}

/**
 * The client's IP address, for per-address limits (rule R1.3). Behind
 * trusted proxies it is the entry the outermost one appended, counted from
 * the end of X-Forwarded-For: entries before it come from the client and can
 * be forged. Otherwise it is the connection's address.
 */
export function clientAddress(sources: AddressSources): ClientAddress {
  const connection = { address: sources.remote ?? "unknown", source: "connection" } as const;
  if (sources.trustedProxies === 0 || sources.forwardedFor === undefined) return connection;
  const entries = sources.forwardedFor.split(",").map((entry) => entry.trim());
  const entry = entries.at(-sources.trustedProxies);
  if (entry === undefined || isIP(entry) === 0) return connection;
  return { address: entry, source: "proxy" };
}
