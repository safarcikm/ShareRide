import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { StepProgress } from "@/components/step-progress";
import { Title } from "@/components/text";
import { spacing } from "@/theme/tokens";
import { stepNames, stepNumber, type StepName } from "./steps";

/**
 * A step of posting a trip: back, "Step 2 of 5" with its bars, the title,
 * and the main button in the bar at the bottom. On Offer, a place of the
 * menu, step 1 has no Back.
 */
export function StepScreen({
  step,
  title,
  footer,
  back = "/drive/trips",
  onOffer = false,
  children,
}: {
  readonly step: StepName;
  readonly title: string;
  readonly footer?: ReactNode;
  readonly back?: Href;
  readonly onOffer?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Screen footer={footer}>
      <View style={styles.header}>
        {onOffer ? null : <BackButton fallback={back} />}
        <StepProgress step={stepNumber(step)} total={stepNames.length} />
      </View>
      <Title>{title}</Title>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
