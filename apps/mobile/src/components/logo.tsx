/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { carDrawing, colors, people } from "@/theme/tokens";

const ground = colors.light.primary;
const shadow = colors.light.primaryEdge;
const roof = colors.light.background;
const tyre = people.face;
const { glass, seat } = carDrawing.light;

/**
 * Logo A, the app icon in small (spec 15, section 4.9): the car from above
 * on moss, the driver front left in a crowberry hat and you in the back. The
 * same in light and dark mode, like the app icon; drawn from
 * `assets/logo/icon.svg`. Hidden from screen readers: the name "ShareRide"
 * always sits beside it.
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
        <G transform="translate(50 50) scale(0.9) translate(-50 -50)">
          <Rect x={17} y={22} width={8} height={16} rx={4} fill={tyre} />
          <Rect x={17} y={63} width={8} height={16} rx={4} fill={tyre} />
          <Rect x={75} y={22} width={8} height={16} rx={4} fill={tyre} />
          <Rect x={75} y={63} width={8} height={16} rx={4} fill={tyre} />
          <Ellipse cx={19} cy={37} rx={4.6} ry={3} fill={roof} />
          <Ellipse cx={81} cy={37} rx={4.6} ry={3} fill={roof} />
          <Rect x={22} y={11} width={56} height={85} rx={22} fill={shadow} />
          <Rect x={22} y={8} width={56} height={85} rx={22} fill={roof} />
          <Rect x={29} y={10} width={10} height={4} rx={2} fill={people.sun} />
          <Rect x={61} y={10} width={10} height={4} rx={2} fill={people.sun} />
          <Rect x={30} y={87.5} width={8} height={3.5} rx={1.7} fill={people.crowberry} />
          <Rect x={62} y={87.5} width={8} height={3.5} rx={1.7} fill={people.crowberry} />
          <Path d="M30 30 Q50 21 70 30 L67 35 Q50 29 33 35 Z" fill={glass} />
          <Rect x={53} y={40} width={18} height={18} rx={6.5} fill={seat} />
          <Rect x={29} y={62} width={18} height={18} rx={6.5} fill={seat} />
          <Path
            d="M34 84 Q50 88 66 84"
            stroke={glass}
            strokeWidth={3.4}
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx={38} cy={50} r={10.5} fill={people.glacier} />
          <Path d="M28 46.5a10 8.5 0 0 1 20 0z" fill={people.crowberry} />
          <Rect x={27} y={44} width={22} height={4.2} rx={2.1} fill={people.wool} />
          <Circle cx={38} cy={37.3} r={2.6} fill={people.wool} />
          <Circle cx={34.88} cy={52.2} r={1.72} fill={people.face} />
          <Circle cx={41.12} cy={52.2} r={1.72} fill={people.face} />
          <Path
            d="M35.04 55.63q2.96 2.34 5.93 0"
            stroke={people.face}
            strokeWidth={1.79}
            fill="none"
            strokeLinecap="round"
          />
          <Circle
            cx={62}
            cy={71}
            r={11.5}
            fill={people.mossLight}
            stroke={ground}
            strokeWidth={2.6}
          />
          <Circle cx={58.2} cy={70} r={2.09} fill={people.face} />
          <Circle cx={65.8} cy={70} r={2.09} fill={people.face} />
          <Path
            d="M58.39 74.18q3.61 2.85 7.22 0"
            stroke={people.face}
            strokeWidth={2.18}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      </Svg>
    </View>
  );
}
