/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, useColorScheme, View } from "react-native";
import Svg, { G, Path, Rect, Text as SvgText } from "react-native-svg";
import { Puffin } from "@/components/puffin";
import { useLanguage } from "@/i18n/language";
import {
  carDrawing,
  controlOutline,
  fontFamily,
  fonts,
  iconSizes,
  people,
  peopleColours,
  radii,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { seatLayout, type SeatSpot } from "./seat-layout";

/** On the web a label counts only on an element with a role. */
const imageRole: object = Platform.OS === "web" ? { role: "img" } : {};

// The drawing's grid, in its own units; it scales to the width it gets.
const seat = 34;
const gap = 6;
/** From the side of the body to the outer seats. */
const inset = 12;
const rowStep = 58;
/** Drawing units to points: the car is drawn this much larger than its grid. */
const scale = 1.3;
/** Room above and below the car for the "You" flag. */
const flagRoom = 28;
const flagHeight = 18;
/** From the back of the body to the back row, and from the front row to the nose. */
const rear = 46;
const nose = 112;
const bodyTop = flagRoom;
const bodyHeight = 3 * seat + 2 * gap + 2 * inset;
const height = bodyTop + bodyHeight + flagRoom;
const corner = 36;
const wheel = { length: 32, width: 10 };
const light = { width: 5, length: 14, fromSide: 34 };

const slotY = (slot: number) => bodyTop + inset + slot * (seat + gap);
/** A puffin on a seat: half its drawing's size, moved back so its beak fits. */
const puffinSize = 0.5;
const puffinShift = 6;

/**
 * The car from above, front to the right, with the seats on the
 * passenger's part (spec 15, section 5.3): the driver, your seats, seats
 * others took, free seats and seats not offered. Positions are
 * illustrative. One image for screen readers, with a label in words, and a
 * legend that repeats the states.
 */
export function SeatView({
  offered,
  free,
  yours,
  driverColour,
}: {
  readonly offered: number;
  /** Seats free on the part, yours included. */
  readonly free: number;
  readonly yours: number;
  /** Index of the driver's people colour, the same on every trip. */
  readonly driverColour: number;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const car = carDrawing[useColorScheme() === "dark" ? "dark" : "light"];
  const taken = offered - free;
  const layout = seatLayout({ offered, taken, yours });
  const shownYours = layout.seats.filter((spot) => spot.state === "you").length;
  const width = rear + (layout.rows - 1) * rowStep + seat + nose;
  const frontX = rear + (layout.rows - 1) * rowStep;
  const xOf = (row: number) => frontX - row * rowStep;
  const firstYours = layout.seats.find((spot) => spot.state === "you");
  // The flag sits outside the car on the side of your first seat, so it
  // never covers another seat.
  const flag =
    firstYours === undefined
      ? undefined
      : {
          x: xOf(firstYours.row),
          y:
            firstYours.slot === 0
              ? bodyTop - wheel.width / 2 - 3 - flagHeight
              : bodyTop + bodyHeight + wheel.width / 2 + 3,
        };

  const label = t("trip.seatView.label", {
    offered,
    taken,
    yours: shownYours,
    free: offered - taken - shownYours,
  });

  return (
    <View style={styles.view}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        {...imageRole}
        testID="seat-view"
        style={[styles.drawing, { maxWidth: width * scale, aspectRatio: width / height }]}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {/* Wheels, then the body, lights, glass and the cabin floor. */}
          {[rear - 4, frontX + seat + 48].map((x) => (
            <G key={x}>
              {[bodyTop - wheel.width / 2, bodyTop + bodyHeight - wheel.width / 2].map((y) => (
                <Rect
                  key={y}
                  x={x}
                  y={y}
                  width={wheel.length}
                  height={wheel.width}
                  rx={wheel.width / 2}
                  fill={car.wheel}
                />
              ))}
            </G>
          ))}
          <Rect
            x={4}
            y={bodyTop}
            width={width - 8}
            height={bodyHeight}
            rx={corner}
            fill={car.body}
          />
          {[
            { x: 4, fill: people.crowberry },
            { x: width - 4 - light.width, fill: people.sun },
          ].flatMap(({ x, fill }) =>
            [bodyTop + light.fromSide, bodyTop + bodyHeight - light.fromSide - light.length].map(
              (y) => (
                <Rect
                  key={`${String(x)}-${String(y)}`}
                  x={x}
                  y={y}
                  width={light.width}
                  height={light.length}
                  rx={light.width / 2}
                  fill={fill}
                />
              ),
            ),
          )}
          <Rect
            x={rear - 18}
            y={bodyTop + 26}
            width={9}
            height={bodyHeight - 52}
            rx={4.5}
            fill={car.glass}
          />
          <Rect
            x={frontX + seat + 30}
            y={bodyTop + 16}
            width={14}
            height={bodyHeight - 32}
            rx={7}
            fill={car.glass}
          />
          <Rect
            x={rear - 6}
            y={bodyTop + 8}
            width={frontX + seat + 32 - rear}
            height={bodyHeight - 16}
            rx={22}
            fill={car.cabin}
          />
          {/* The steering wheel, seen from above, in front of the driver. */}
          <Rect
            x={frontX + seat + 8}
            y={slotY(0) + seat / 2 - 12}
            width={5}
            height={24}
            rx={2.5}
            fill={car.steering}
          />
          {layout.seats.map((spot) => (
            <SeatShape
              key={`${String(spot.row)}${String(spot.slot)}`}
              spot={spot}
              x={xOf(spot.row)}
              y={slotY(spot.slot)}
              seatColour={car.seat}
              takenColour={car.taken}
              driverColour={peopleColours[driverColour % peopleColours.length] ?? people.glacier}
            />
          ))}
          {flag === undefined ? null : (
            <G>
              <Rect
                x={flag.x - 4}
                y={flag.y}
                width={seat + 8}
                height={flagHeight}
                rx={flagHeight / 2}
                fill={palette.primary}
              />
              <SvgText
                x={flag.x + seat / 2}
                y={flag.y + 13}
                fontSize={11}
                fontFamily={fontFamily(fonts.bodyBold)}
                fill={palette.onPrimary}
                textAnchor="middle"
              >
                {t("trip.seatView.you")}
              </SvgText>
            </G>
          )}
        </Svg>
      </View>
      <View
        style={styles.legend}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        <LegendItem label={t("trip.seatView.you")}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: palette.primarySoft, borderColor: palette.primary },
            ]}
          />
        </LegendItem>
        <LegendItem label={t("trip.seatView.taken")}>
          <View style={[styles.swatch, { backgroundColor: car.taken, borderColor: car.taken }]} />
        </LegendItem>
        <LegendItem label={t("trip.seatView.free")}>
          <View
            style={[
              styles.swatch,
              styles.dashed,
              { backgroundColor: palette.surface, borderColor: palette.control },
            ]}
          />
        </LegendItem>
      </View>
    </View>
  );
}

function LegendItem({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.legendItem}>
      {children}
      <Text style={[typography.small, { color: palette.textMuted }]}>{label}</Text>
    </View>
  );
}

/** One seat in its state, with a puffin on it when someone sits there. */
function SeatShape({
  spot,
  x,
  y,
  seatColour,
  takenColour,
  driverColour,
}: {
  readonly spot: SeatSpot;
  readonly x: number;
  readonly y: number;
  readonly seatColour: string;
  readonly takenColour: string;
  readonly driverColour: string;
}) {
  const palette = usePalette();
  const cx = x + seat / 2;
  const cy = y + seat / 2;
  switch (spot.state) {
    case "driver":
      return (
        <G>
          <Rect x={x} y={y} width={seat} height={seat} rx={9} fill={seatColour} />
          <Puffin
            testID="puffin-driver"
            x={cx - puffinShift}
            y={cy + 2}
            size={puffinSize}
            look={{ kind: "colour", hat: driverColour }}
          />
        </G>
      );
    case "you":
      return (
        <G>
          <Rect
            x={x + 1.5}
            y={y + 1.5}
            width={seat - 3}
            height={seat - 3}
            rx={8}
            fill={palette.primarySoft}
            stroke={palette.primary}
            strokeWidth={3}
          />
          <Puffin
            testID="puffin-you"
            x={cx - puffinShift}
            y={cy - 1}
            size={puffinSize}
            look={{ kind: "colour", scarf: people.mossLight }}
          />
        </G>
      );
    case "taken":
      return (
        <G>
          <Rect x={x} y={y} width={seat} height={seat} rx={9} fill={seatColour} />
          <Puffin
            testID="puffin-taken"
            x={cx - puffinShift}
            y={cy + 1}
            size={puffinSize}
            look={{ kind: "grey", black: takenColour, face: seatColour }}
          />
        </G>
      );
    case "free":
      return (
        <Rect
          x={x + 1}
          y={y + 1}
          width={seat - 2}
          height={seat - 2}
          rx={8}
          fill={palette.surface}
          stroke={palette.control}
          strokeWidth={controlOutline}
          strokeDasharray="5 4"
        />
      );
    case "notOffered":
      return (
        <G>
          <Rect x={x} y={y} width={seat} height={seat} rx={9} fill={palette.border} />
          <Path
            d={`M${String(cx - 6)} ${String(cy - 6)}L${String(cx + 6)} ${String(cy + 6)}M${String(cx + 6)} ${String(cy - 6)}L${String(cx - 6)} ${String(cy + 6)}`}
            stroke={palette.control}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </G>
      );
  }
}

/**
 * Your seat on its own, with you in it, as the seat view draws it: the
 * picture that greets a booking just made (spec 16, 3.7, item 4). Only a
 * picture: the words beside it say what it means.
 */
export function YourSeat() {
  const palette = usePalette();
  const size = seat * scale * 2;
  return (
    <View
      testID="your-seat"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.yourSeat}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${String(seat)} ${String(seat)}`}>
        <Rect
          x={1.5}
          y={1.5}
          width={seat - 3}
          height={seat - 3}
          rx={8}
          fill={palette.primarySoft}
          stroke={palette.primary}
          strokeWidth={3}
        />
        <Puffin
          testID="puffin-you"
          x={seat / 2 - puffinShift}
          y={seat / 2 - 1}
          size={puffinSize}
          look={{ kind: "colour", scarf: people.mossLight }}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: spacing.sm },
  yourSeat: { alignSelf: "center" },
  drawing: { width: "100%", alignSelf: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  swatch: {
    width: iconSizes.tick,
    height: iconSizes.tick,
    borderRadius: radii.seat,
    borderWidth: controlOutline,
  },
  dashed: { borderStyle: "dashed" },
});
