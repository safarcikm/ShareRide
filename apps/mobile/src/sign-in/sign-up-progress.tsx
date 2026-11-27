import { StyleSheet, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { StepProgress } from "@/components/step-progress";
import { spacing } from "@/theme/tokens";

/** Signing up takes three steps: the number, the code, about you (spec 16, 3.5 item 1). */
export const signUpSteps = 3;

/**
 * Back, when there is a step to go back to, and "Step 2 of 3" with its bars.
 * Step 1 and its email code show no step: who is new is known only from the
 * number on (spec 29, 3.6).
 */
export function SignUpProgress({
  step,
  back = true,
}: {
  readonly step?: 2 | 3;
  readonly back?: boolean;
}) {
  return (
    <View style={styles.header}>
      {back ? <BackButton /> : null}
      {step === undefined ? null : <StepProgress step={step} total={signUpSteps} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
