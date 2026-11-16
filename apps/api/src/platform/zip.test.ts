import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readZip, zip } from "./zip.ts";

describe("ZIP files (download my data)", () => {
  const files = [
    { name: "shareride-data.json", data: Buffer.from('{"hello":"Jón"}') },
    { name: "shareride-data.html", data: Buffer.from("<p>Halló, heimur! ".repeat(200)) },
    { name: "empty.txt", data: Buffer.alloc(0) },
  ];

  it("reads back what was written", () => {
    const archive = zip(files, new Date("2026-11-16T12:34:56Z"));
    expect(readZip(archive)).toEqual(files);
  });

  it("compresses text", () => {
    const archive = zip(files, new Date("2026-11-16T12:34:56Z"));
    const text = files.reduce((size, file) => size + file.data.length, 0);
    expect(archive.length).toBeLessThan(text);
  });

  it("opens with the system's unzip", () => {
    const folder = mkdtempSync(join(tmpdir(), "zip-test-"));
    try {
      const path = join(folder, "test.zip");
      writeFileSync(path, zip(files, new Date("2026-11-16T12:34:56Z")));
      const listing = execFileSync("unzip", ["-t", path]).toString();
      expect(listing).toContain("No errors detected");
      expect(execFileSync("unzip", ["-p", path, "shareride-data.json"]).toString()).toBe(
        '{"hello":"Jón"}',
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
