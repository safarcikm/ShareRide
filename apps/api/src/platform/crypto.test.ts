import { describe, expect, it } from "vitest";
import { createKeyedHasher, hashToken, newToken, sameHash } from "./crypto.ts";

describe("newToken", () => {
  it("makes a 256-bit random token with a prefix that names its kind", () => {
    const token = newToken("access");
    expect(token).toMatch(/^sr_at_[A-Za-z0-9_-]{43}$/);
    expect(newToken("refresh")).toMatch(/^sr_rt_[A-Za-z0-9_-]{43}$/);
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
