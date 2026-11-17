import { describe, expect, it } from "vitest";
import { toBase64 } from "./photos.ts";

describe("toBase64", () => {
  it("writes a file's bytes as the API reads them", () => {
    expect(toBase64(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe("/9j/2Q==");
    expect(toBase64(new Uint8Array())).toBe("");
  });

  it("writes a large file in parts, the same as at once", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});
