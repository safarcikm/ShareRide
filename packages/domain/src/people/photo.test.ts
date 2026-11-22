import { describe, expect, it } from "vitest";
import { stripPhotoMetadata } from "../meeting-points/photos.ts";
import { checkProfilePhoto, photoShown, profilePhotoLimits } from "./photo.ts";

const segment = (marker: number, data: readonly number[]) => [
  0xff,
  marker,
  (data.length + 2) >> 8,
  (data.length + 2) & 0xff,
  ...data,
];

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

const jfif = segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const quantisation = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
const frame = (width: number, height: number) =>
  segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]);
const huffman = segment(0xc4, [0, ...Array.from({ length: 16 }, (_, i) => (i === 0 ? 1 : 0)), 0]);
const scan = segment(0xda, [1, 1, 0, 0, 63, 0]);

/** What an iPhone's encoder adds: Exif with a place in it, and a colour profile. */
const exif = segment(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 64.1466 -21.9426")]);
const iccProfile = segment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, 0, 0]);

/** A JPEG as the app writes it, `padding` bytes of scan data long. */
function jpeg(
  options: {
    readonly width?: number;
    readonly height?: number;
    readonly before?: readonly number[];
    readonly padding?: number;
  } = {},
): Uint8Array {
  const { width = 640, height = 640, padding = 4 } = options;
  return Uint8Array.from([
    0xff,
    0xd8,
    ...jfif,
    ...(options.before ?? []),
    ...quantisation,
    ...frame(width, height),
    ...huffman,
    ...scan,
    ...Array.from({ length: padding }, () => 0x12),
    0xff,
    0xd9,
  ]);
}

/** A whole file of exactly `bytes` bytes. */
const jpegOfSize = (bytes: number) => jpeg({ padding: bytes - jpeg({ padding: 0 }).length });

describe("checkProfilePhoto", () => {
  it("takes a square JPEG with nothing but the picture, and gives its edge", () => {
    expect(checkProfilePhoto(jpeg())).toEqual({ ok: true, value: { edge: 640 } });
    expect(checkProfilePhoto(jpeg({ width: 256, height: 256 }))).toEqual({
      ok: true,
      value: { edge: 256 },
    });
  });

  it("refuses a photo that is not square", () => {
    expect(checkProfilePhoto(jpeg({ width: 640, height: 480 }))).toEqual({
      ok: false,
      error: "not_square",
    });
  });

  it("refuses a photo smaller than 256 pixels or larger than 640", () => {
    expect(checkProfilePhoto(jpeg({ width: 255, height: 255 }))).toEqual({
      ok: false,
      error: "too_small",
    });
    expect(checkProfilePhoto(jpeg({ width: 641, height: 641 }))).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("refuses a file over 512 KB", () => {
    expect(checkProfilePhoto(jpegOfSize(profilePhotoLimits.maxBytes)).ok).toBe(true);
    expect(checkProfilePhoto(jpegOfSize(profilePhotoLimits.maxBytes + 1))).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("refuses an iPhone-shaped file until what the phone added is dropped", () => {
    const fromPhone = jpeg({ before: [...exif, ...iccProfile] });
    expect(checkProfilePhoto(fromPhone)).toEqual({ ok: false, error: "metadata" });
    expect(checkProfilePhoto(stripPhotoMetadata(fromPhone))).toEqual({
      ok: true,
      value: { edge: 640 },
    });
  });

  it("refuses a file that is not a JPEG", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkProfilePhoto(png)).toEqual({ ok: false, error: "not_jpeg" });
  });
});

describe("photoShown", () => {
  const key = "profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";

  it("is true for a photo ShareRide has not hidden (spec 9, 3.4.3)", () => {
    expect(photoShown({ photoKey: key, photoHiddenAt: null })).toBe(true);
  });

  it("is false without a photo, or for one ShareRide hid", () => {
    expect(photoShown({ photoKey: null, photoHiddenAt: null })).toBe(false);
    expect(photoShown({ photoKey: key, photoHiddenAt: new Date("2026-11-22T10:00:00Z") })).toBe(
      false,
    );
  });
});
