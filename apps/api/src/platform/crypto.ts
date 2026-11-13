import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const tokenPrefixes = { access: "sr_at", refresh: "sr_rt" } as const;

/**
 * A new opaque token: 256 random bits (ADR 0016). The prefix tells access and
 * refresh tokens apart and lets secret scanners recognise leaked tokens.
 */
export function newToken(kind: keyof typeof tokenPrefixes): string {
  return `${tokenPrefixes[kind]}_${randomBytes(32).toString("base64url")}`;
}

/** How tokens are stored: SHA-256 is enough for 256-bit random values. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * HMAC-SHA-256 with the server secret, for values with few possibilities
 * (sign-in codes, phone numbers, IP addresses), so a copy of the database
 * alone cannot reverse them. The purpose keeps hashes of different kinds
 * apart.
 */
export type KeyedHasher = (purpose: string, value: string) => string;

export function createKeyedHasher(secret: string): KeyedHasher {
  return (purpose, value) =>
    createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

/** Compares two hex hashes in constant time. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
