import type { BannerDay, BannerSeason } from "@shareride/domain";
import type { PuffinDress } from "@/components/puffin";
import { bannerDrawing, people } from "@/theme/tokens";

/**
 * What the car and the scene wear on a day (spec 36, 3.4 and 3.5), from
 * the preview's `THEMES`: what rides on the roof, snow on it, flags,
 * balloons and a heart, what each puffin wears over its everyday look, the
 * sky's own thing, and a season laid over the land (the first snow).
 */
export interface DayLook {
  readonly load: "case" | "tree" | "egg" | "tent" | "bun" | "flowers";
  readonly roofSnow: boolean;
  readonly flags: "wings" | "roof" | null;
  readonly balloons: boolean;
  readonly heart: "driver" | "you" | null;
  readonly you: PuffinDress;
  readonly driver: PuffinDress;
  readonly sky: "fireworks" | "sunrise" | null;
  readonly cover: BannerSeason | null;
}

const plain: DayLook = {
  load: "case",
  roofSnow: false,
  flags: null,
  balloons: false,
  heart: null,
  you: {},
  driver: {},
  sky: null,
  cover: null,
};

export const dayLooks: Record<BannerDay, DayLook> = {
  christmas: {
    ...plain,
    load: "tree",
    you: { headwear: { kind: "yule" } },
    driver: { headwear: { kind: "yule" } },
  },
  newyear: {
    ...plain,
    roofSnow: true,
    sky: "fireworks",
    you: { headwear: { kind: "party", colour: bannerDrawing.sky } },
    driver: { headwear: { kind: "party", colour: people.crowberry } },
  },
  easter: { ...plain, load: "egg" },
  summerday: { ...plain, sky: "sunrise", driver: { glasses: true } },
  june17: { ...plain, flags: "wings", balloons: true },
  longweekend: { ...plain, load: "tent" },
  winterday: {
    ...plain,
    roofSnow: true,
    cover: "winter",
    you: { headwear: { kind: "wool", colour: bannerDrawing.sky } },
  },
  dec1: { ...plain, roofSnow: true, flags: "roof" },
  bondadagur: { ...plain, load: "flowers", heart: "driver" },
  konudagur: { ...plain, load: "flowers", heart: "you" },
  bolludagur: { ...plain, load: "bun" },
  oskudagur: {
    ...plain,
    roofSnow: true,
    you: { mask: true },
    driver: { headwear: { kind: "crown" } },
  },
  seafarers: {
    ...plain,
    you: { headwear: { kind: "sailor" } },
    driver: { headwear: { kind: "sailor" } },
  },
};

/**
 * The car's look on `day`, or in `season` on a plain day: the case on the
 * roof, with snow on it in winter. Neither given, the car as everywhere else.
 */
export function carLook(day: BannerDay | null, season: BannerSeason | undefined): DayLook {
  return day === null ? { ...plain, roofSnow: season === "winter" } : dayLooks[day];
}

/** Each puffin's everyday look, under what a day gives it. */
export const everyday = {
  you: { scarf: people.mossLight },
  driver: { headwear: { kind: "wool", colour: people.crowberry } },
} as const satisfies Record<"you" | "driver", PuffinDress>;
