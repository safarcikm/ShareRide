import { CircleAlert, Info } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { iconSizes, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";
import { TakesFocus } from "./takes-focus";

/**
 * A message about the last action, read out by screen readers when it
 * appears. An error sits on the error fill with an alert icon, information on
 * the info fill with an info icon (spec 15, section 5.1).
 */
export function Notice({
  message,
  kind = "error",
  urgent = kind === "error",
  selectable = false,
}: {
  readonly message: string | null;
  readonly kind?: "error" | "info";
  /** Read out at once, as an alert: errors, and information that needs an answer. */
  readonly urgent?: boolean;
  /** Lets the person select and copy the text, such as a link to share by hand. */
  readonly selectable?: boolean;
}) {
  const palette = usePalette();
  if (message === null) return null;
  const isError = kind === "error";
  return (
    <View
      testID="notice"
      accessible
      accessibilityRole={urgent ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: isError ? palette.errorSoft : palette.infoSoft }]}
    >
      <Icon
        icon={isError ? CircleAlert : Info}
        color={isError ? palette.error : palette.text}
        size={iconSizes.button}
      />
      <Text
        selectable={selectable}
        style={[typography.body, styles.message, { color: palette.text }]}
      >
        {message}
      </Text>
    </View>
  );
}

/** What an `ActionNotice` says, and which press of the button it answers. */
export interface Said {
  readonly message: string;
  readonly press: number;
}

/**
 * What a screen's main button has to say, for its `ActionNotice`: `say`
 * the words after a press that did nothing, and null once that is mended
 * or the button is pressed again. The same words after another press are
 * said again, as that press changed nothing else a screen reader could
 * tell.
 */
export function useSaid(): readonly [Said | null, (message: string | null) => void] {
  const [said, setSaid] = useState<Said | null>(null);
  const presses = useRef(0);
  const say = useCallback((message: string | null) => {
    if (message === null) {
      setSaid(null);
      return;
    }
    presses.current += 1;
    setSaid({ message, press: presses.current });
  }, []);
  return [said, say];
}

/**
 * Why a screen's main button did not do what it says, over that button: in
 * the bar it is seen without scrolling, on a phone too (spec 31, 3.8 and
 * 3.19). It takes focus when it appears, when it says something new, and
 * when another press gets the same words (`useSaid`).
 *
 * The rule for its words (spec 31, 3.20): plain words only where the
 * screen takes them away as the button is pressed again, as before a call
 * to the server is tried once more, so the same words after it are a new
 * notice and take focus again. What is said without leaving the press, as
 * "Choose a reason.", comes from `useSaid`: plain words would stay as
 * they are on a second press, and tell a screen reader nothing.
 */
export function ActionNotice({ says }: { readonly says: Said | string | null }) {
  if (says === null) return null;
  const { message, press } = typeof says === "string" ? { message: says, press: 0 } : says;
  return (
    <TakesFocus key={`${press}:${message}`}>
      <Notice message={message} />
    </TakesFocus>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radii.control,
    padding: spacing.md,
  },
  message: { flex: 1 },
});
