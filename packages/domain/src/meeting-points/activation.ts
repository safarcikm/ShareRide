// Activating a meeting point in the operator console (spec 2, 3.6.3): only
// when every item of the activation checklist is done (rule R2.3).
// Activation then computes the point's legs (3.7), so the checklist asks
// only that it can have them: a road within 1 km.

/** The checklist's items, in the order the console shows them. */
export const activationItems = [
  /** A name, location, type, region and municipality. */
  "details",
  /** "Where to stand" in Icelandic and English. */
  "whereToStand",
  /** At least one photo with its descriptions in both languages. */
  "photos",
  /** The amenities reviewed. */
  "amenities",
  /** The season reviewed. */
  "season",
  /** The date the operator confirmed the point (decision 2). */
  "confirmed",
  /** A road within 1 km, so activation can compute its legs. */
  "legs",
] as const;
export type ActivationItem = (typeof activationItems)[number];

/** What the checklist reads of a draft. Its spot is always set. */
export interface ActivationPoint {
  readonly nameIs: string;
  readonly region: string;
  readonly municipality: string;
  readonly type: string;
  readonly whereToStandIs: string | null;
  readonly whereToStandEn: string | null;
  readonly amenitiesReviewedOn: string | null;
  readonly seasonReviewedOn: string | null;
  readonly lastCheckedOn: string | null;
}

export interface ActivationPhoto {
  readonly descriptionIs: string;
  readonly descriptionEn: string;
}

export interface ActivationCheck {
  readonly item: ActivationItem;
  readonly done: boolean;
}

const written = (text: string | null) => text !== null && text.trim() !== "";

/** Each item of R2.3 and whether the point has it. */
export function activationChecklist(
  point: ActivationPoint,
  photos: readonly ActivationPhoto[],
  legs: { readonly nearRoad: boolean },
): ActivationCheck[] {
  const done: Record<ActivationItem, boolean> = {
    details: [point.nameIs, point.region, point.municipality, point.type].every(written),
    whereToStand: written(point.whereToStandIs) && written(point.whereToStandEn),
    photos: photos.some((photo) => written(photo.descriptionIs) && written(photo.descriptionEn)),
    amenities: point.amenitiesReviewedOn !== null,
    season: point.seasonReviewedOn !== null,
    confirmed: point.lastCheckedOn !== null,
    legs: legs.nearRoad,
  };
  return activationItems.map((item) => ({ item, done: done[item] }));
}

/** Every item is done. */
export function readyToActivate(checklist: readonly ActivationCheck[]): boolean {
  return checklist.every((check) => check.done);
}
