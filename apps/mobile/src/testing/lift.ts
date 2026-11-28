import { cardLift, chunky } from "@/theme/pressable";
import type { ColorScheme } from "@/theme/tokens";

/**
 * The style of a card's face (spec 15, section 4.4): its hairline and soft
 * shadow, or an outline in `ring`, such as `primary` under the pointer.
 */
export function cardFace(ring?: string, scheme: ColorScheme = "light") {
  return { boxShadow: cardLift(scheme, ring === undefined ? {} : { ring }).face.boxShadow };
}

/** The style of a button's face resting on an `edge` in `color`: the even solid edge under it. */
export function edgeUnder(edge: number, color: string) {
  return { boxShadow: chunky(edge, color, false).face.boxShadow };
}
