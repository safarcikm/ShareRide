import { createHash } from "node:crypto";

/**
 * The same ID for the same key on every run, so a seed updates its rows
 * instead of adding new ones: a UUID (version 8) from a hash of the key.
 * The prefix is the sample seed's, where it began, so the places keep the
 * IDs they had as sample places (spec 21, 6).
 */
export function stableId(key: string): string {
  const hex = createHash("sha256").update(`shareride-sample:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
