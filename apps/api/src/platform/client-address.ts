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

/**
 * What per-address limits count by: an IPv4 address, or the /64 network of
 * an IPv6 address. One home connection or server usually has a whole /64,
 * so counting single IPv6 addresses would let it change address each time.
 */
export function addressBlock(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped !== undefined && isIP(mapped) === 4) return mapped;
  if (isIP(address) !== 6) return address;
  const [head = "", tail] = address.toLowerCase().split("::");
  const groups = (part: string | undefined) =>
    part === undefined || part === "" ? [] : part.split(":");
  const front = groups(head);
  const back = groups(tail);
  // An IPv4 tail (64:ff9b::1.2.3.4) fills the last two groups.
  const width = (part: string[]) =>
    part.reduce((sum, group) => sum + (group.includes(".") ? 2 : 1), 0);
  const missing = tail === undefined ? 0 : 8 - width(front) - width(back);
  const full = [...front, ...Array<string>(Math.max(missing, 0)).fill("0"), ...back];
  const prefix = full.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(":")}::/64`;
}
