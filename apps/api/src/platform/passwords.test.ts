import { describe, expect, it } from "vitest";
import { createHashGate, hashPassword, verifyPassword } from "./passwords.ts";

// Members' password hashes (ADR 0047): scrypt from Node's crypto.

// Real hashes with today's settings take a tenth of a second or more each,
// and some tests make five; while every package tests at once on CI, that
// can pass the 5 seconds a test is given by default.
describe("hashPassword and verifyPassword", { timeout: 30_000 }, () => {
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

  it("refuses settings that are not whole numbers, need too much memory or too many passes", async () => {
    for (const stored of [
      "scrypt$15.5$8$3$AAAA$AAAA",
      "scrypt$15$1.5$3$AAAA$AAAA",
      "scrypt$20$16$16$AAAA$AAAA",
      "scrypt$16$8$1$AAAA$AAAA",
      "scrypt$15$8$16$AAAA$AAAA",
    ]) {
      expect(await verifyPassword("anything", stored)).toEqual({ ok: false, outdated: true });
    }
  });

  it("takes a hash's time for a value it cannot read, as for one it can", async () => {
    const started = performance.now();
    await verifyPassword("anything", "bcrypt$whatever");
    // scrypt with today's settings takes a tenth of a second or more.
    expect(performance.now() - started).toBeGreaterThan(20);
  });
});

describe("createHashGate", () => {
  function later() {
    let finish = () => {};
    const done = new Promise<string>((resolve) => {
      finish = () => {
        resolve("done");
      };
    });
    return { done, finish };
  }

  it("runs a few hashes at once, queues a few more, and turns away the rest", async () => {
    const gate = createHashGate({ running: 2, waiting: 1 });
    const tasks = [later(), later(), later(), later()];
    const started: number[] = [];
    const results = tasks.map((task, index) =>
      gate.run(() => {
        started.push(index);
        return task.done;
      }),
    );
    expect(await results[3]).toBeNull();
    expect(started).toEqual([0, 1]);
    tasks[0]?.finish();
    expect(await results[0]).toBe("done");
    // The waiting one takes the place that was freed.
    expect(started).toEqual([0, 1, 2]);
    tasks[1]?.finish();
    tasks[2]?.finish();
    expect(await Promise.all([results[1], results[2]])).toEqual(["done", "done"]);
    // All places free again.
    expect(await gate.run(() => Promise.resolve("again"))).toBe("again");
  });

  it("frees the place of a hash that failed", async () => {
    const gate = createHashGate({ running: 1, waiting: 0 });
    await expect(gate.run(() => Promise.reject(new Error("broken")))).rejects.toThrow("broken");
    expect(await gate.run(() => Promise.resolve("next"))).toBe("next");
  });
});
