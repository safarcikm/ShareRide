import { describe, expect, it } from "vitest";
import {
  checkPhotoFile,
  checkPhotoOrder,
  photoLimits,
  stripPhotoMetadata,
  validatePhotoDescriptions,
} from "./photos.ts";

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
const frame = (marker: number, width: number, height: number) =>
  segment(marker, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]);
const huffman = segment(0xc4, [0, ...Array.from({ length: 16 }, (_, i) => (i === 0 ? 1 : 0)), 0]);
const scan = segment(0xda, [1, 1, 0, 0, 63, 0]);
/** Entropy-coded data, with a stuffed 0xFF and a restart marker as real scans have. */
const scanData = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];

/** A JPEG as a browser's canvas writes it, with segments added or changed. */
function jpeg(
  options: {
    readonly width?: number;
    readonly height?: number;
    readonly before?: readonly number[];
    readonly afterScan?: readonly number[];
    readonly frameMarker?: number;
    readonly trailing?: readonly number[];
  } = {},
): Uint8Array {
  const { width = 1200, height = 900, frameMarker = 0xc0 } = options;
  return Uint8Array.from([
    0xff,
    0xd8,
    ...jfif,
    ...(options.before ?? []),
    ...quantisation,
    ...frame(frameMarker, width, height),
    ...huffman,
    ...scan,
    ...scanData,
    ...(options.afterScan ?? []),
    0xff,
    0xd9,
    ...(options.trailing ?? []),
  ]);
}

describe("checkPhotoFile", () => {
  it("takes a JPEG as a browser writes it, and gives its size", () => {
    expect(checkPhotoFile(jpeg({ width: 1600, height: 1200 }))).toEqual({
      ok: true,
      value: { width: 1600, height: 1200 },
    });
  });

  it("reads a progressive JPEG's size, and the later scans of one", () => {
    const secondScan = [...huffman, ...scan, 0x9a, 0xbc];
    expect(
      checkPhotoFile(jpeg({ width: 800, height: 1600, frameMarker: 0xc2, afterScan: secondScan })),
    ).toEqual({ ok: true, value: { width: 800, height: 1600 } });
  });

  it("refuses a file that is not a JPEG", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkPhotoFile(png)).toEqual({ ok: false, error: "not_jpeg" });
    expect(checkPhotoFile(new Uint8Array())).toEqual({ ok: false, error: "not_jpeg" });
  });

  it("refuses a JPEG cut short or with no picture in it", () => {
    const whole = jpeg();
    expect(checkPhotoFile(whole.slice(0, whole.length - 2))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
    expect(checkPhotoFile(Uint8Array.from([0xff, 0xd8, ...jfif, 0xff, 0xd9]))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
  });

  it("refuses camera and location data, and any other metadata", () => {
    const exif = segment(0xe1, [...ascii("Exif"), 0, 0, 0x4d, 0x4d]);
    const xmp = segment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x/>"));
    const iccProfile = segment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1]);
    const photoshop = segment(0xed, ascii("Photoshop 3.0\0"));
    const comment = segment(0xfe, ascii("Taken at N1 Fitjar"));
    for (const extra of [exif, xmp, iccProfile, photoshop, comment]) {
      expect(checkPhotoFile(jpeg({ before: extra }))).toEqual({ ok: false, error: "metadata" });
    }
  });

  it("refuses metadata hidden after the picture's first scan", () => {
    const comment = segment(0xfe, ascii("hidden"));
    expect(checkPhotoFile(jpeg({ afterScan: comment }))).toEqual({
      ok: false,
      error: "metadata",
    });
  });

  it("refuses a JFIF extension, which carries a thumbnail", () => {
    const extension = segment(0xe0, [...ascii("JFXX"), 0, 0x10]);
    expect(checkPhotoFile(jpeg({ before: extension }))).toEqual({ ok: false, error: "metadata" });
  });

  it("refuses a JFIF header that carries a thumbnail or anything else", () => {
    const thumbnail = segment(0xe0, [
      ...ascii("JFIF"),
      ...[0, 1, 1, 0, 0, 1, 0, 1, 1, 1],
      ...[0xaa, 0xbb, 0xcc],
    ]);
    const longer = segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...ascii("hi")]);
    for (const header of [thumbnail, longer]) {
      const file = Uint8Array.from([0xff, 0xd8, ...header, ...jpeg().slice(2 + jfif.length)]);
      expect(checkPhotoFile(file)).toEqual({ ok: false, error: "metadata" });
    }
  });

  it("refuses segments a browser does not write, which could carry anything", () => {
    const extension = segment(0xf0, ascii("hidden"));
    expect(checkPhotoFile(jpeg({ before: extension }))).toEqual({ ok: false, error: "metadata" });
    // Arithmetic coding and lossless frames are pictures, but not a browser's.
    for (const frameMarker of [0xc3, 0xc9]) {
      expect(checkPhotoFile(jpeg({ frameMarker }))).toEqual({ ok: false, error: "not_jpeg" });
    }
    const arithmeticTable = segment(0xcc, [0, 0x11]);
    expect(checkPhotoFile(jpeg({ before: arithmeticTable }))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
  });

  it("takes bytes between segments only as a scan's data", () => {
    expect(checkPhotoFile(jpeg({ before: ascii("hidden") }))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
    expect(checkPhotoFile(jpeg({ afterScan: [...huffman, ...ascii("hidden")] }))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
    // A restart marker belongs in a scan too.
    expect(checkPhotoFile(jpeg({ before: [0xff, 0xd0] }))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
  });

  it("refuses tables and headers with more in them than their parts", () => {
    const tables = Array.from({ length: 64 }, () => 1);
    for (const before of [
      segment(0xdb, [0, ...tables, ...ascii("hidden")]),
      segment(0xc4, [0, 1, ...Array.from({ length: 15 }, () => 0), 0, ...ascii("hidden")]),
      segment(0xdd, [0, 8, ...ascii("hidden")]),
    ]) {
      expect(checkPhotoFile(jpeg({ before }))).toEqual({ ok: false, error: "not_jpeg" });
    }
    const longScan = segment(0xda, [1, 1, 0, 0, 63, 0, ...ascii("hidden")]);
    expect(checkPhotoFile(jpeg({ afterScan: [...longScan, 0x12] }))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
  });

  it("takes a restart interval, as some encoders write", () => {
    expect(checkPhotoFile(jpeg({ before: segment(0xdd, [0, 8]) })).ok).toBe(true);
  });

  it("refuses anything after the end of the picture", () => {
    expect(checkPhotoFile(jpeg({ trailing: ascii("PK") }))).toEqual({
      ok: false,
      error: "metadata",
    });
  });

  it("refuses a photo over 1 600 pixels on its longer side", () => {
    expect(checkPhotoFile(jpeg({ width: 1601, height: 900 }))).toEqual({
      ok: false,
      error: "too_large",
    });
    expect(checkPhotoFile(jpeg({ width: 900, height: 1601 }))).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("refuses a file over 2 MB", () => {
    const padding = segment(
      0xdb,
      Array.from({ length: 65_000 }, () => 1),
    );
    const big = jpeg({ before: Array.from({ length: 33 }, () => padding).flat() });
    expect(big.length).toBeGreaterThan(photoLimits.maxBytes);
    expect(checkPhotoFile(big)).toEqual({ ok: false, error: "too_large" });
  });
});

describe("stripPhotoMetadata", () => {
  const exif = segment(0xe1, [...ascii("Exif"), 0, 0, 0x4d, 0x4d, 0, 0x2a]);
  const photoshop = segment(0xed, ascii("Photoshop 3.0\0"));

  it("leaves a file with only the picture's segments as it is", () => {
    const file = jpeg();
    expect(stripPhotoMetadata(file)).toEqual(file);
  });

  it("keeps only the picture of a file as Safari's canvas writes it", () => {
    const tables = jpeg().slice(2 + jfif.length);
    const safari = Uint8Array.from([0xff, 0xd8, ...exif, ...photoshop, ...tables]);
    const stripped = stripPhotoMetadata(safari);
    expect(stripped).toEqual(Uint8Array.from([0xff, 0xd8, ...tables]));
    expect(checkPhotoFile(stripped)).toEqual({ ok: true, value: { width: 1200, height: 900 } });
  });

  it("drops comments, ICC profiles, JFIF thumbnails, metadata after a scan and after the end", () => {
    const thumbnail = segment(0xe0, [
      ...ascii("JFIF"),
      ...[0, 1, 1, 0, 0, 1, 0, 1, 1, 1],
      ...[0xaa, 0xbb, 0xcc],
    ]);
    const iccProfile = segment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1]);
    const comment = segment(0xfe, ascii("Taken at N1 Fitjar"));
    const file = Uint8Array.from([
      0xff,
      0xd8,
      ...thumbnail,
      ...jpeg({
        before: [...iccProfile, ...comment],
        afterScan: comment,
        trailing: ascii("PK"),
      }).slice(2 + jfif.length),
    ]);
    const stripped = stripPhotoMetadata(file);
    expect(checkPhotoFile(stripped)).toEqual({ ok: true, value: { width: 1200, height: 900 } });
    expect(stripped).toEqual(Uint8Array.from([0xff, 0xd8, ...jpeg().slice(2 + jfif.length)]));
  });

  it("leaves a file that is not a whole JPEG for the check to refuse", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    expect(stripPhotoMetadata(png)).toEqual(png);
    const cut = jpeg().slice(0, 40);
    expect(checkPhotoFile(stripPhotoMetadata(cut)).ok).toBe(false);
  });
});

describe("validatePhotoDescriptions", () => {
  it("tidies both descriptions", () => {
    expect(
      validatePhotoDescriptions({
        descriptionIs: "  Skýlið við N1 ",
        descriptionEn: "The shelter at N1\n",
      }),
    ).toEqual({
      ok: true,
      value: { descriptionIs: "Skýlið við N1", descriptionEn: "The shelter at N1" },
    });
  });

  it("needs a description in each language, of at most 250 letters", () => {
    expect(
      validatePhotoDescriptions({
        descriptionIs: " ",
        descriptionEn: "é".repeat(photoLimits.descriptionMaxLength + 1),
      }),
    ).toEqual({
      ok: false,
      error: [
        { field: "descriptionIs", issue: "required" },
        { field: "descriptionEn", issue: "too_long" },
      ],
    });
    expect(
      validatePhotoDescriptions({
        descriptionIs: "é".repeat(photoLimits.descriptionMaxLength),
        descriptionEn: "A sign",
      }).ok,
    ).toBe(true);
  });
});

describe("checkPhotoOrder", () => {
  it("takes every photo of the point once, in its new order", () => {
    expect(checkPhotoOrder(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });

  it("refuses an order that leaves a photo out, repeats one or adds another", () => {
    expect(checkPhotoOrder(["a", "b", "c"], ["c", "a"])).toBe(false);
    expect(checkPhotoOrder(["a", "b"], ["a", "a"])).toBe(false);
    expect(checkPhotoOrder(["a", "b"], ["a", "b", "d"])).toBe(false);
  });
});
