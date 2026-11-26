import { typeScale } from "@shareride/ui";
import { Platform } from "react-native";

/**
 * The app's design tokens: the shared ones from `@shareride/ui` (spec 15,
 * ADR 0017), and the type styles with each face as a React Native font
 * family. Screens and components use these, never raw colours or sizes.
 */
export * from "@shareride/ui";

/**
 * A font face as a font family. On the web a system font stands in if the
 * face fails to load; phones fall back to the system font by themselves.
 */
export function fontFamily(face: string, os: string = Platform.OS): string {
  return os === "web" ? `${face}, system-ui, sans-serif` : face;
}

/**
 * What keeps the words of a title apart on the web. Fredoka's space is
 * narrow, and its kerning pulls a "V" or a "T" after a space closer still,
 * so "N1 Vík" read as "N1Vík" (spec 31, 3.18): the browser sets the title
 * face without kerning and with a slightly wider space. Phones draw text
 * their own way and have neither setting.
 */
export function wordsApart(
  face: string,
  os: string = Platform.OS,
): { readonly fontKerning?: "none"; readonly wordSpacing?: string } {
  return os === "web" && face.startsWith("Fredoka")
    ? { fontKerning: "none", wordSpacing: "0.06em" }
    : {};
}

type TypeStyle = keyof typeof typeScale;

export const typography = Object.fromEntries(
  Object.entries(typeScale).map(([name, { face, fontSize, lineHeight }]) => [
    name,
    { fontFamily: fontFamily(face), fontSize, lineHeight, ...wordsApart(face) },
  ]),
) as {
  readonly [K in TypeStyle]: {
    readonly fontFamily: string;
    readonly fontSize: (typeof typeScale)[K]["fontSize"];
    readonly lineHeight: (typeof typeScale)[K]["lineHeight"];
  };
};
