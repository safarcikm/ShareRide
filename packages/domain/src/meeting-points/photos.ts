// Photos of a meeting point (spec 2, 3.6.3 and R2.3): what the API takes
// from the operator console. The console resizes each photo and writes it
// again as a JPEG, which leaves out where and how it was taken; the API
// checks that it did (ADR 0029).
import { err, ok, type Result } from "../result.ts";

export const photoLimits = {
  /** Photos of one point. */
  maxPerPoint: 5,
  /** Bytes in one file: 2 MB. */
  maxBytes: 2 * 1024 * 1024,
  /** Pixels on a photo's longer side. */
  maxEdge: 1600,
  /** Letters in each language's description, read by screen readers. */
  descriptionMaxLength: 250,
} as const;

/**
 * Why a file is refused: not a whole JPEG, carrying data other than the
 * picture (camera, location, a comment, a thumbnail, anything after its
 * end), or bigger than `photoLimits`.
 */
export type PhotoFileIssue = "not_jpeg" | "metadata" | "too_large";

export interface PhotoSize {
  readonly width: number;
  readonly height: number;
}

const marker = {
  start: 0xd8,
  end: 0xd9,
  scan: 0xda,
  quantisation: 0xdb,
  huffman: 0xc4,
  restartInterval: 0xdd,
  app0: 0xe0,
  comment: 0xfe,
} as const;

/** The frames a browser writes: baseline, extended and progressive, Huffman-coded. */
const frames: ReadonlySet<number> = new Set([0xc0, 0xc1, 0xc2]);

/**
 * Segments that carry data besides the picture: APP1 to APP15 (Exif, XMP,
 * ICC profiles, Photoshop's), comments, and the JPG extensions.
 */
const isMetadata = (code: number) =>
  (code > marker.app0 && code <= 0xef) || code === marker.comment || (code >= 0xf0 && code <= 0xfd);

const isRestart = (code: number) => code >= 0xd0 && code <= 0xd7;

const startsWith = (bytes: Uint8Array, at: number, text: string) =>
  Array.from(text).every((letter, i) => bytes[at + i] === letter.charCodeAt(0));

/** The JFIF header and nothing else: no thumbnail, no extension. */
const isPlainJfif = (data: Uint8Array) =>
  data.length === 14 && startsWith(data, 0, "JFIF\0") && data[12] === 0 && data[13] === 0;

/** Whether tables fill a segment exactly; `sizeAt` is a table's size, or undefined if it is not one. */
function tablesFill(data: Uint8Array, sizeAt: (at: number) => number | undefined): boolean {
  let at = 0;
  while (at < data.length) {
    const size = sizeAt(at);
    if (size === undefined) return false;
    at += size;
  }
  return at === data.length;
}

/** A quantisation table: its precision and number, then 64 values of 1 or 2 bytes. */
const quantisationTableAt = (data: Uint8Array) => (at: number) => {
  const precisionAndId = data[at] ?? 0xff;
  if (precisionAndId >> 4 > 1 || (precisionAndId & 0x0f) > 3) return undefined;
  return 1 + (precisionAndId >> 4 === 0 ? 64 : 128);
};

/** A Huffman table: its class and number, 16 counts, then as many symbols as they add up to. */
const huffmanTableAt = (data: Uint8Array) => (at: number) => {
  const classAndId = data[at] ?? 0xff;
  if (classAndId >> 4 > 1 || (classAndId & 0x0f) > 3 || at + 17 > data.length) return undefined;
  let symbols = 0;
  for (let i = 1; i <= 16; i += 1) symbols += data[at + i] ?? 0;
  return 17 + symbols;
};

/** A frame header: precision, height, width and three bytes for each component. */
function frameSize(data: Uint8Array): PhotoSize | undefined {
  const components = data[5] ?? 0;
  if (components === 0 || data.length !== 6 + 3 * components) return undefined;
  const height = ((data[1] ?? 0) << 8) | (data[2] ?? 0);
  const width = ((data[3] ?? 0) << 8) | (data[4] ?? 0);
  return width === 0 || height === 0 ? undefined : { width, height };
}

/** A scan header: its components, two bytes each, and three bytes of settings. */
const isScanHeader = (data: Uint8Array) => {
  const components = data[0] ?? 0;
  return components >= 1 && components <= 4 && data.length === 4 + 2 * components;
};

/**
 * Checks a photo's file, segment by segment, against what a browser writes:
 * a baseline or progressive JPEG with only the plain JFIF header besides
 * its tables, frame and scans, each exactly as long as its parts, and coded
 * data only after a scan's header. Anything else could carry data besides
 * the picture. Gives the picture's size.
 */
export function checkPhotoFile(bytes: Uint8Array): Result<PhotoSize, PhotoFileIssue> {
  if (bytes.length > photoLimits.maxBytes) return err("too_large");
  if (bytes[0] !== 0xff || bytes[1] !== marker.start) return err("not_jpeg");
  let size: PhotoSize | undefined;
  let scanned = false;
  let inScan = false;
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) {
      // Only a scan's coded data comes between segments.
      if (!inScan) return err("not_jpeg");
      at += 1;
      continue;
    }
    const code = bytes[at + 1];
    if (code === undefined) return err("not_jpeg");
    // 0xFF 0xFF is padding before a marker.
    if (code === 0xff) {
      at += 1;
      continue;
    }
    // 0xFF 0x00 is a 0xFF in a scan's data; restart markers divide it.
    if (code === 0x00 || isRestart(code)) {
      if (!inScan) return err("not_jpeg");
      at += 2;
      continue;
    }
    inScan = false;
    if (code === marker.end) {
      if (!scanned || size === undefined) return err("not_jpeg");
      if (at + 2 !== bytes.length) return err("metadata");
      return Math.max(size.width, size.height) > photoLimits.maxEdge ? err("too_large") : ok(size);
    }
    const high = bytes[at + 2];
    const low = bytes[at + 3];
    if (high === undefined || low === undefined) return err("not_jpeg");
    const length = (high << 8) | low;
    const next = at + 2 + length;
    if (length < 2 || next > bytes.length) return err("not_jpeg");
    if (isMetadata(code)) return err("metadata");
    const data = bytes.subarray(at + 4, next);
    switch (code) {
      case marker.app0:
        if (!isPlainJfif(data)) return err("metadata");
        break;
      case marker.quantisation:
        if (!tablesFill(data, quantisationTableAt(data))) return err("not_jpeg");
        break;
      case marker.huffman:
        if (!tablesFill(data, huffmanTableAt(data))) return err("not_jpeg");
        break;
      case marker.restartInterval:
        if (data.length !== 2) return err("not_jpeg");
        break;
      case marker.scan:
        if (size === undefined || !isScanHeader(data)) return err("not_jpeg");
        inScan = true;
        scanned = true;
        break;
      default: {
        // One frame, before its scans; any other segment is not a browser's.
        if (!frames.has(code) || size !== undefined) return err("not_jpeg");
        size = frameSize(data);
        if (size === undefined) return err("not_jpeg");
      }
    }
    at = next;
  }
  return err("not_jpeg");
}

/**
 * Drops what a browser may add to the JPEG it writes besides the picture
 * (Safari's Exif and Photoshop segments, ICC profiles, comments, a JFIF
 * header with a thumbnail) and anything after the picture's end, as the
 * console does before it sends a photo (ADR 0029). The picture's own
 * segments stay as they are; a file that is not a whole JPEG is given back
 * unchanged, for `checkPhotoFile` to refuse.
 */
export function stripPhotoMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== marker.start) return bytes;
  const kept: Uint8Array[] = [];
  let from = 0;
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const code = bytes[at + 1];
    if (code === undefined) return bytes;
    if (code === 0xff) {
      at += 1;
      continue;
    }
    if (code === 0x00 || isRestart(code)) {
      at += 2;
      continue;
    }
    if (code === marker.end) {
      kept.push(bytes.subarray(from, at + 2));
      const stripped = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0));
      let written = 0;
      for (const part of kept) {
        stripped.set(part, written);
        written += part.length;
      }
      return stripped;
    }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    const next = at + 2 + length;
    if (length < 2 || next > bytes.length) return bytes;
    const extra =
      isMetadata(code) || (code === marker.app0 && !isPlainJfif(bytes.subarray(at + 4, next)));
    if (extra) {
      kept.push(bytes.subarray(from, at));
      from = next;
    }
    at = next;
  }
  return bytes;
}

/** A photo's description in both languages, read by screen readers (spec 2, 3.2). */
export interface PhotoDescriptions {
  readonly descriptionIs: string;
  readonly descriptionEn: string;
}

export interface PhotoDescriptionProblem {
  readonly field: keyof PhotoDescriptions;
  readonly issue: "required" | "too_long";
}

/** Checks both descriptions, tidied like the point's other text (NFC, trimmed). */
export function validatePhotoDescriptions(
  descriptions: PhotoDescriptions,
): Result<PhotoDescriptions, readonly PhotoDescriptionProblem[]> {
  const problems: PhotoDescriptionProblem[] = [];
  const tidy = (field: keyof PhotoDescriptions) => {
    const tidied = descriptions[field].normalize("NFC").trim();
    if (tidied === "") problems.push({ field, issue: "required" });
    else if (Array.from(tidied).length > photoLimits.descriptionMaxLength) {
      problems.push({ field, issue: "too_long" });
    }
    return tidied;
  };
  const descriptionIs = tidy("descriptionIs");
  const descriptionEn = tidy("descriptionEn");
  return problems.length > 0 ? err(problems) : ok({ descriptionIs, descriptionEn });
}

/** Whether a new order holds each of the point's photos once, and nothing else. */
export function checkPhotoOrder(current: readonly string[], order: readonly string[]): boolean {
  return (
    order.length === current.length &&
    new Set(order).size === order.length &&
    order.every((id) => current.includes(id))
  );
}
