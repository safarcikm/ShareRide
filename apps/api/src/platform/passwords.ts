import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { scryptSettings } from "@shareride/domain";

// Members' passwords as scrypt hashes (ADR 0047), with the settings each was
// made with, so stronger settings later apply at the next sign-in.

export interface ScryptCost {
  readonly logN: number;
  readonly r: number;
  readonly p: number;
}

/** Room for scrypt's 128 * r * (N + 2) bytes and its 128 * r * p, with some to spare. */
const maxmem = 64 * 1024 * 1024;

/** The memory scrypt asks for with these settings, as OpenSSL counts it. */
const memoryOf = (cost: ScryptCost) => 128 * cost.r * (2 ** cost.logN + 2) + 128 * cost.r * cost.p;

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

/**
 * Settings this server would make: whole numbers, within scrypt's memory
 * and at most 4 passes. A stored value outside them is not read.
 */
const readable = (cost: ScryptCost) =>
  [cost.logN, cost.r, cost.p].every(Number.isInteger) &&
  cost.logN >= 10 &&
  cost.r >= 1 &&
  cost.p >= 1 &&
  cost.p <= 4 &&
  memoryOf(cost) <= maxmem;

/** Hashed in place of a value that cannot be read, so the answer takes as long. */
const unreadableSalt = Buffer.alloc(scryptSettings.saltBytes);

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
  const refused = { ok: false, outdated: true } as const;
  try {
    if (kind !== "scrypt" || salt === undefined || hash === undefined || !readable(cost)) {
      await derive(password, unreadableSalt, scryptSettings, scryptSettings.keyBytes);
      return refused;
    }
    const expected = Buffer.from(hash, "base64url");
    if (expected.length === 0) return refused;
    const key = await derive(password, Buffer.from(salt, "base64url"), cost, expected.length);
    const outdated =
      cost.logN !== scryptSettings.logN ||
      cost.r !== scryptSettings.r ||
      cost.p !== scryptSettings.p;
    return { ok: timingSafeEqual(key, expected), outdated };
  } catch {
    // Settings scrypt itself refuses: as wrong, never a failed request.
    return refused;
  }
}

export interface HashGate {
  /**
   * Runs `task` once one of the places is free; null at once when the queue
   * is full, so a burst of tries cannot take every thread or all the memory.
   */
  run<T>(task: () => Promise<T>): Promise<T | null>;
}

/** A few scrypt hashes at a time (32 MiB each), the next few waiting, the rest turned away. */
export function createHashGate(size: {
  readonly running: number;
  readonly waiting: number;
}): HashGate {
  let active = 0;
  const queue: (() => void)[] = [];
  return {
    async run(task) {
      if (active < size.running) active += 1;
      else if (queue.length < size.waiting) {
        // The place comes from the task that ends, still counted in `active`.
        await new Promise<void>((resolve) => queue.push(resolve));
      } else return null;
      try {
        return await task();
      } finally {
        const next = queue.shift();
        if (next === undefined) active -= 1;
        else next();
      }
    },
  };
}
