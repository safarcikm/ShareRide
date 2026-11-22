// A person's profile photo (spec 1, 3.5; ADR 0033): what the API takes
// from the app. The app crops the photo square and writes it again as a
// JPEG without what the phone added; the API checks that it did, with the
// same check as meeting point photos (ADR 0029).
import { checkPhotoFile, type PhotoFileIssue } from "../meeting-points/photos.ts";
import { err, ok, type Result } from "../result.ts";

export const profilePhotoLimits = {
  /** Pixels on each side: the app makes the largest. */
  minEdge: 256,
  maxEdge: 640,
  /** Bytes in one file: 512 KB. */
  maxBytes: 512 * 1024,
} as const;

/**
 * Why a file is refused: as a meeting point photo (not a whole JPEG, data
 * besides the picture, too large), or not square, or smaller than
 * `profilePhotoLimits.minEdge`.
 */
export type ProfilePhotoIssue = PhotoFileIssue | "not_square" | "too_small";

/** Checks a profile photo's file and gives the length of its sides. */
export function checkProfilePhoto(
  bytes: Uint8Array,
): Result<{ readonly edge: number }, ProfilePhotoIssue> {
  if (bytes.length > profilePhotoLimits.maxBytes) return err("too_large");
  const file = checkPhotoFile(bytes);
  if (!file.ok) return file;
  const { width, height } = file.value;
  if (width !== height) return err("not_square");
  if (width < profilePhotoLimits.minEdge) return err("too_small");
  if (width > profilePhotoLimits.maxEdge) return err("too_large");
  return ok({ edge: width });
}

/**
 * Whether others see a person's photo: there is one, and ShareRide has not
 * hidden it (spec 9, 3.4.3). A hidden photo also counts as none for driving.
 */
export function photoShown(person: {
  readonly photoKey: string | null;
  readonly photoHiddenAt: Date | null;
}): boolean {
  return person.photoKey !== null && person.photoHiddenAt === null;
}
