import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords.ts";

// Members' password hashes (ADR 0047): scrypt from Node's crypto.

describe("hashPassword and verifyPassword", () => {
  it("stores scrypt's settings, a salt and the hash, never the password", async () => {
    const hash = await hashPassword("puffins fly north");
    expect(hash).toMatch(/^scrypt\$15\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain("puffins");
  });

  it("salts each hash, so the same password hashes differently", async () => {
    expect(await hashPassword("puffins fly north")).not.toBe(
      await hashPassword("puffins fly north"),
    );
  });

  it("knows the right password and refuses another", async () => {
    const hash = await hashPassword("puffins fly north");
    expect(await verifyPassword("puffins fly north", hash)).toEqual({
      ok: true,
      outdated: false,
    });
    expect(await verifyPassword("puffins fly south", hash)).toEqual({
      ok: false,
      outdated: false,
    });
  });

  it("checks a hash made with other settings, and says it is outdated", async () => {
    const older = await hashPassword("puffins fly north", { logN: 14, r: 8, p: 1 });
    expect(older.startsWith("scrypt$14$8$1$")).toBe(true);
    expect(await verifyPassword("puffins fly north", older)).toEqual({
      ok: true,
      outdated: true,
    });
  });

  it("refuses a stored value it cannot read, rather than throwing", async () => {
    expect(await verifyPassword("anything", "bcrypt$whatever")).toEqual({
      ok: false,
      outdated: true,
    });
    expect(await verifyPassword("anything", "scrypt$40$8$3$AAAA$AAAA")).toEqual({
      ok: false,
      outdated: true,
    });
  });
});
