import { View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { colors, people, puffin } from "@/theme/tokens";

const ground = colors.light.primary;
const black = people.face;

/**
 * Logo C, the puffin pin (spec 15, section 4.9): our puffin as a map pin on
 * moss, its beak pointing the way. It is the app icon in small, the same in
 * light and dark mode, and draws the shapes of `assets/logo/icon.svg` (a test
 * checks they match). Hidden from screen readers: the name always sits beside it.
 */
export function Logo({ size }: { readonly size: number }) {
  return (
    <View
      testID="logo"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* Rounded like an app icon on a phone. */}
        <Rect width={100} height={100} rx={22} fill={ground} />
        {/* The pin is the puffin's black; its white face is cut in it. */}
        <Path
          d="M46.4 86 C41 75.2 21.2 62.6 21.2 41 C21.2 25.7 32.9 14 46.4 14 C59.9 14 71.6 25.7 71.6 41 C71.6 62.6 51.8 75.2 46.4 86 Z"
          fill={black}
        />
        <Path
          d="M28.4 41 C28.4 32.9 34.7 27.5 42.8 27.5 C51.8 27.5 60.8 28.4 64.4 29.3 L64.4 51.8 C59.9 59.9 52.7 63.5 45.5 63.5 C35.6 63.5 28.4 55.4 28.4 41 Z"
          fill={puffin.white}
        />
        {/* The eye, with its red ring and the grey marks above and below. */}
        <Path d="M48.2 31.1 L53.6 31.1 L50.9 27.68 Z" fill={puffin.eyeMark} />
        <Path d="M48.92 44.96 L52.88 44.96 L50.9 47.48 Z" fill={puffin.eyeMark} />
        <Circle cx={50.9} cy={37.85} r={4.77} fill={puffin.beakGroove} />
        <Circle cx={50.9} cy={37.85} r={3.6} fill={black} />
        <Circle cx={52.16} cy={36.59} r={1.26} fill={puffin.white} />
        <Ellipse cx={41.9} cy={51.8} rx={4.5} ry={3.06} fill={people.crowberry} opacity={0.8} />
        {/* The beak: the grey plate, a yellow line, then orange with its grooves. */}
        <Path
          d="M63.5 24.69 C72.5 24.69 82.06 30.31 86.56 40.55 C79.81 45.5 71.94 48.88 63.5 49.55 Z"
          fill={puffin.beak}
        />
        <Path d="M63.5 24.69 L68.67 25.29 L68.67 48.79 L63.5 49.55 Z" fill={puffin.beakPlate} />
        <Path d="M68.67 25.29 L71.04 25.98 L71.04 48.21 L68.67 48.79 Z" fill={people.sun} />
        <Path
          d="M76.55 28.18 Q78.8 35.38 76.55 47.08 M81.5 32.45 Q83.08 37.62 81.5 43.92"
          stroke={puffin.beakGroove}
          strokeWidth={1.35}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M63.5 40.55 Q75.88 41.67 86.56 40.55"
          stroke={puffin.beakGroove}
          strokeWidth={1.24}
          fill="none"
        />
        <Circle cx={64.04} cy={48.2} r={2.52} fill={people.sun} />
      </Svg>
    </View>
  );
}
