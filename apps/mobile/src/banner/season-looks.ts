import type { BannerSeason } from "@shareride/domain";
import { icelandSeasons, type ColorScheme } from "@/theme/tokens";

/**
 * What the Iceland scene draws in each season, by day and at night (spec
 * 36, 3.3); its colours are `icelandSeasons`. `caps` is how many peaks
 * have a glacier, `capDepth` how far down each side it reaches. Snow on
 * the road's edge and the farmhouse's roof comes with a season whose
 * colours have `snow`.
 */
export interface SeasonLook {
  readonly caps: number;
  readonly capDepth: number;
  readonly stars: boolean;
  readonly aurora: boolean;
  /** The sun high in a summer's day, or the midnight sun low on the mountains. */
  readonly sun: "high" | "midnight" | null;
  readonly flowers: boolean;
  readonly lupines: boolean;
  readonly heather: boolean;
}

const plain = {
  stars: false,
  aurora: false,
  sun: null,
  flowers: false,
  lupines: false,
  heather: false,
} as const;

export const seasonLooks: Record<BannerSeason, Record<ColorScheme, SeasonLook>> = {
  // Snow down the mountains; on a dark screen the northern lights.
  winter: {
    light: { ...plain, caps: 9, capDepth: 0.5 },
    dark: { ...plain, caps: 9, capDepth: 0.5, stars: true, aurora: true },
  },
  // The last snow on the peaks, small flowers in the grass.
  spring: {
    light: { ...plain, caps: 3, capDepth: 0.42, flowers: true },
    dark: { ...plain, caps: 3, capDepth: 0.42, flowers: true, stars: true },
  },
  // Lupines, the sun high by day and the midnight sun in the bright night.
  summer: {
    light: { ...plain, caps: 2, capDepth: 0.28, lupines: true, sun: "high" },
    dark: { ...plain, caps: 2, capDepth: 0.28, lupines: true, sun: "midnight" },
  },
  // Heather and birch, the first snow on the peaks; the northern lights.
  autumn: {
    light: { ...plain, caps: 4, capDepth: 0.36, heather: true },
    dark: { ...plain, caps: 4, capDepth: 0.36, heather: true, stars: true, aurora: true },
  },
};

/** The colour above the scene, as behind a phone's status bar: the sky's top. */
export function sceneTop(season: BannerSeason, scheme: ColorScheme): string {
  return icelandSeasons[season][scheme].skyTop;
}
