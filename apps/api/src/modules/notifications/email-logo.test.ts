import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emailLogo } from "./email-logo.ts";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG's width and height, from its first chunk (IHDR). */
function sizeOf(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("emailLogo (spec 24, 3.1)", () => {
  it("is the browser tab icon as a PNG, three times its 40 pixels in the email", () => {
    expect([...emailLogo.content.subarray(0, 8)]).toEqual(pngSignature);
    expect(sizeOf(emailLogo.content)).toEqual({ width: 120, height: 120 });
    expect(emailLogo).toMatchObject({
      contentId: "puffinride-logo",
      filename: "puffinride.png",
      contentType: "image/png",
    });
  });

  it("is exported from the drawing the app's tab icon comes from", () => {
    // export-icons.ts writes both from favicon.svg; the tab icon is the same
    // drawing at 48 pixels, so both start as PNGs with see-through corners.
    const tab = readFileSync(new URL("../../../../mobile/assets/favicon.png", import.meta.url));
    expect(sizeOf(tab)).toEqual({ width: 48, height: 48 });
    // Colour type 6: RGBA, as the corners outside the disc are see-through.
    expect(emailLogo.content[25]).toBe(6);
    expect(tab[25]).toBe(6);
  });
});
