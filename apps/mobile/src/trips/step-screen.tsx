import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Columns } from "@/components/columns";
import { Screen, useWideScreen } from "@/components/screen";
import { StepProgress } from "@/components/step-progress";
import { Title } from "@/components/text";
import { maxContentWidth, sideColumnWidth, spacing } from "@/theme/tokens";
import { stepNames, stepNumber, type StepName } from "./steps";
import { TripSoFar, type SoFar } from "./trip-so-far";

/**
 * A step of posting a trip: back, "Step 2 of 5" with its bars, the title,
 * and the main button in the bar at the bottom. On Offer, a place of the
 * menu, step 1 has no Back.
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
  footer,
  back = "/offer",
  onOffer = false,
  soFar,
  map,
  children,
}: {
  readonly step: StepName;
  readonly title: string;
  readonly footer?: ReactNode;
  readonly back?: Href;
  readonly onOffer?: boolean;
  /** What the trip has so far, for wide screens; the review, which shows it all, has none. */
  readonly soFar?: SoFar | undefined;
  /** The step's map, on wide screens only: a phone has it among the step's fields. */
  readonly map?: ReactNode;
  readonly children: ReactNode;
}) {
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
          <View style={styles.header}>
            {onOffer ? null : <BackButton fallback={back} />}
            <StepProgress step={stepNumber(step)} total={stepNames.length} />
          </View>
          <Title align={wide ? "start" : "center"}>{title}</Title>
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
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  // As in the bottom bar: the button and the lines that belong to it.
  action: { gap: spacing.sm },
});
