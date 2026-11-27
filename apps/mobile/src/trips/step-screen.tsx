import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Columns } from "@/components/columns";
import { Road } from "@/components/road";
import { Screen, useWideScreen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { maxContentWidth, sideColumnWidth, spacing } from "@/theme/tokens";
import { stepNames, stepNumber, type StepName } from "./steps";
import { TripSoFar, type SoFar } from "./trip-so-far";

/** The five stops of the road, by step: Route, Time, Seats, Price, Check. */
const roadNames = {
  route: "road.route",
  time: "road.time",
  seats: "road.seats",
  price: "road.price",
  review: "road.check",
} as const satisfies Record<StepName, string>;

/**
 * A step of posting a trip (spec 31, 3.11, item 1): Back beside the road,
 * whose car stands on this step, the title under them at the left with at
 * most one `line`, and the main button in the bar at the bottom. On Offer,
 * a place of the menu, step 1 has no Back and the road has the whole
 * width.
 *
 * On a wide screen (spec 18, 3.13) the step is the main column, as wide as
 * a phone's column, and beside it stand "Your trip so far" (`soFar`), the
 * main button with its lines in place of the bottom bar, and under the
 * button the step's `map`, so the button keeps its place when a map comes.
 * The step is one tree at every width, so what its fields hold stays when
 * a window crosses the breakpoint.
 */
export function StepScreen({
  step,
  title,
  line,
  footer,
  back = "/offer",
  onOffer = false,
  soFar,
  map,
  children,
}: {
  readonly step: StepName;
  readonly title: string;
  /** Under the title, such as what the last step shows. */
  readonly line?: string | undefined;
  readonly footer?: ReactNode;
  readonly back?: Href;
  readonly onOffer?: boolean;
  /** What the trip has so far, for wide screens; the review, which shows it all, has none. */
  readonly soFar?: SoFar | undefined;
  /** The step's map, on wide screens only: a phone has it among the step's fields. */
  readonly map?: ReactNode;
  readonly children: ReactNode;
}) {
  const { t } = useLanguage();
  const wide = useWideScreen();
  const side = wide ? (
    <>
      {soFar === undefined ? null : <TripSoFar soFar={soFar} />}
      {footer === undefined ? null : <View style={styles.action}>{footer}</View>}
      {map}
    </>
  ) : null;
  return (
    <Screen width="page" footer={wide ? undefined : footer}>
      <View style={wide ? styles.pair : null}>
        <Columns side={side}>
          <ScreenHead
            title={title}
            line={line}
            back={onOffer ? null : back}
            road={
              <Road
                steps={stepNames.map((name) => t(roadNames[name]))}
                current={stepNumber(step) - 1}
              />
            }
          />
          {children}
        </Columns>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The two columns together, in the middle of the page.
  pair: {
    width: "100%",
    maxWidth: maxContentWidth + spacing.lg + sideColumnWidth,
    alignSelf: "center",
  },
  // As in the bottom bar: the button and the lines that belong to it.
  action: { gap: spacing.sm },
});
