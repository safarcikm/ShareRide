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

type TypeStyle = keyof typeof typeScale;

export const typography = Object.fromEntries(
  Object.entries(typeScale).map(([name, { face, fontSize, lineHeight }]) => [
    name,
    { fontFamily: fontFamily(face), fontSize, lineHeight },
  ]),
) as {
  readonly [K in TypeStyle]: {
    readonly fontFamily: string;
    readonly fontSize: (typeof typeScale)[K]["fontSize"];
    readonly lineHeight: (typeof typeScale)[K]["lineHeight"];
  };
};
