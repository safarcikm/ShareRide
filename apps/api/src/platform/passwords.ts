import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { scryptSettings } from "@shareride/domain";

// Members' passwords as scrypt hashes (ADR 0047), with the settings each was
// made with, so stronger settings later apply at the next sign-in.

export interface ScryptCost {
  readonly logN: number;
  readonly r: number;
  readonly p: number;
}

/** Room for scrypt's 128 * N * r bytes, with some to spare. */
const maxmem = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: ScryptCost, length: number): Promise<Buffer> {
  const options: ScryptOptions = { N: 2 ** cost.logN, r: cost.r, p: cost.p, maxmem };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, key) => {
      if (error === null) resolve(key);
      else reject(error);
    });
  });
}

/** `scrypt$<logN>$<r>$<p>$<salt>$<hash>`, salt and hash in base64url. */
export async function hashPassword(
  password: string,
  cost: ScryptCost = scryptSettings,
): Promise<string> {
  const salt = randomBytes(scryptSettings.saltBytes);
  const key = await derive(password, salt, cost, scryptSettings.keyBytes);
  const parts = [cost.logN, cost.r, cost.p].map(String);
  return ["scrypt", ...parts, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Settings this server would never make: a stored value outside them is not read. */
const readable = (cost: ScryptCost) =>
  cost.logN >= 10 && cost.logN <= 20 && cost.r >= 1 && cost.r <= 16 && cost.p >= 1 && cost.p <= 16;

/**
 * Whether the password is the one hashed, compared in constant time, and
 * whether the hash was made with other settings than today's.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ readonly ok: boolean; readonly outdated: boolean }> {
  const [kind, logN, r, p, salt, hash] = stored.split("$");
  const cost = { logN: Number(logN), r: Number(r), p: Number(p) };
  if (kind !== "scrypt" || salt === undefined || hash === undefined || !readable(cost)) {
    return { ok: false, outdated: true };
  }
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), cost, expected.length);
  const outdated =
    cost.logN !== scryptSettings.logN || cost.r !== scryptSettings.r || cost.p !== scryptSettings.p;
  return { ok: expected.length > 0 && timingSafeEqual(key, expected), outdated };
}
