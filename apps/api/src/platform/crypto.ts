import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const tokenPrefixes = {
  access: "sr_at",
  refresh: "sr_rt",
  emailLink: "sr_ev",
  operatorSession: "sr_os",
  operatorSetup: "sr_ol",
  dataExport: "sr_dx",
} as const;

/**
 * A new opaque token: 256 random bits (ADR 0016). The prefix tells access and
 * refresh tokens, email links, console sessions, setup links and data export
 * links apart and lets secret scanners recognise leaked tokens.
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

/** Encrypts files kept for a while, such as a person's data export (spec 11, 7). */
export interface FileCipher {
  /** `context` binds the file to where it is kept, such as its row's ID. */
  seal(data: Buffer, context: string): Buffer;
  /**
   * Throws when the file was changed, moved to another context, or sealed
   * for another purpose or with another secret.
   */
  open(sealed: Buffer, context: string): Buffer;
}

const ivBytes = 12;
const tagBytes = 16;

/**
 * AES-256-GCM with a key derived from the server secret for one purpose
 * (HKDF-SHA-256), and a fresh IV per file: `iv | ciphertext | tag`, with
 * the context as additional data. A new `AUTH_SECRET` makes earlier files
 * unreadable.
 */
export function createFileCipher(secret: string, purpose: string): FileCipher {
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), purpose, 32));
  return {
    seal(data, context) {
      const iv = randomBytes(ivBytes);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(context));
      const body = Buffer.concat([cipher.update(data), cipher.final()]);
      return Buffer.concat([iv, body, cipher.getAuthTag()]);
    },
    open(sealed, context) {
      const iv = sealed.subarray(0, ivBytes);
      const tag = sealed.subarray(sealed.length - tagBytes);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(sealed.subarray(ivBytes, sealed.length - tagBytes)),
        decipher.final(),
      ]);
    },
  };
}
