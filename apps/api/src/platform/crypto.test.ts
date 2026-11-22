import { describe, expect, it } from "vitest";
import { createFileCipher, createKeyedHasher, hashToken, newToken, sameHash } from "./crypto.ts";

describe("newToken", () => {
  it("makes a 256-bit random token with a prefix that names its kind", () => {
    const token = newToken("access");
    expect(token).toMatch(/^sr_at_[A-Za-z0-9_-]{43}$/);
    expect(newToken("refresh")).toMatch(/^sr_rt_[A-Za-z0-9_-]{43}$/);
    expect(newToken("providerState")).toMatch(/^sr_st_[A-Za-z0-9_-]{43}$/);
    expect(newToken("providerTicket")).toMatch(/^sr_pt_[A-Za-z0-9_-]{43}$/);
    expect(newToken("pendingSignIn")).toMatch(/^sr_ps_[A-Za-z0-9_-]{43}$/);
    expect(newToken("access")).not.toBe(token);
  });
});

describe("hashToken", () => {
  it("is SHA-256 in hex, the same every time", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("createKeyedHasher", () => {
  const hash = createKeyedHasher("a-long-random-secret-of-at-least-32-characters");

  it("depends on the purpose, so one hash cannot stand in for another", () => {
    expect(hash("phone", "+3546900000")).not.toBe(hash("ip", "+3546900000"));
  });

  it("depends on the secret", () => {
    const other = createKeyedHasher("another-long-random-secret-of-32-characters");
    expect(hash("phone", "+3546900000")).not.toBe(other("phone", "+3546900000"));
  });

  it("is stable", () => {
    expect(hash("code", "123456")).toBe(hash("code", "123456"));
  });
});

describe("sameHash", () => {
  it("compares hex hashes", () => {
    expect(sameHash(hashToken("a"), hashToken("a"))).toBe(true);
    expect(sameHash(hashToken("a"), hashToken("b"))).toBe(false);
    expect(sameHash(hashToken("a"), "abc")).toBe(false);
  });
});

describe("files sealed at rest (spec 11, 7: exports stored encrypted)", () => {
  const secret = "a-test-secret-of-at-least-32-characters";
  const cipher = createFileCipher(secret, "shareride-data-export-v1");
  const file = Buffer.from("Jón's data");

  const owner = "export-1";

  it("opens what it sealed, and the sealed bytes do not show the content", () => {
    const sealed = cipher.seal(file, owner);
    expect(sealed.includes(file)).toBe(false);
    expect(cipher.open(sealed, owner)).toEqual(file);
  });

  it("seals the same file differently each time", () => {
    expect(cipher.seal(file, owner).equals(cipher.seal(file, owner))).toBe(false);
  });

  it("refuses a changed file, another purpose and another secret", () => {
    const sealed = cipher.seal(file, owner);
    const changed = Buffer.from(sealed);
    const at = changed.length - 20;
    changed.writeUInt8(changed.readUInt8(at) ^ 1, at);
    expect(() => cipher.open(changed, owner)).toThrow();
    expect(() => createFileCipher(secret, "another-purpose").open(sealed, owner)).toThrow();
    expect(() =>
      createFileCipher("another-secret-of-at-least-32-characters", "shareride-data-export-v1").open(
        sealed,
        owner,
      ),
    ).toThrow();
  });

  it("refuses a file moved to another record", () => {
    expect(() => cipher.open(cipher.seal(file, owner), "export-2")).toThrow();
  });
});
