import type { CallFailure } from "@shareride/api-client";
import { formatClock } from "@shareride/i18n";
import { CircleCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** When "I'm here" opens and closes at a stop, and when it was said there. */
export interface CheckInState {
  readonly opensAt: string;
  readonly closesAt: string;
  readonly at: string | null;
}

/**
 * "I'm here" at a stop (spec 8, 3.2; R8.3): once said, what it told; while
 * it is open, one large button; before then, when it opens; after it
 * closes, nothing. One tap, no typing: it is used while parked. `send`
 * asks the API; `onSaid` loads the page again with what it stored.
 */
export function ImHere({
  state,
  told,
  accessibilityLabel,
  send,
  onSaid,
}: {
  readonly state: CheckInState;
  /** What saying it did: the driver, or the passengers getting in there, were told. */
  readonly told: string;
  readonly accessibilityLabel?: string;
  readonly send: () => Promise<
    { readonly ok: true; readonly data: { checkedInAt: string } } | CallFailure
  >;
  readonly onSaid: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [sending, setSending] = useState(false);
  // Said here, before the page loads again with it.
  const [saidAt, setSaidAt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (state.at !== null || saidAt !== null) {
    return (
      <View style={styles.row} accessible accessibilityLiveRegion="polite">
        <Icon icon={CircleCheck} color={palette.primary} />
        <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>{told}</Text>
      </View>
    );
  }
  const time = now();
  const opensAt = new Date(state.opensAt);
  if (time > new Date(state.closesAt))
    return problem === null ? null : <Notice message={problem} />;
  if (time < opensAt && problem === null) {
    return <Body align="start">{t("tripDay.opensAt", { time: formatClock(opensAt) })}</Body>;
  }
  return (
    <>
      <Button
        main
        label={t("tripDay.imHere")}
        {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
        busy={sending}
        onPress={() => {
          setSending(true);
          setProblem(null);
          void send().then((answer) => {
            setSending(false);
            if (answer.ok) {
              setSaidAt(answer.data.checkedInAt);
              onSaid();
              return;
            }
            const { code, opensAt: opens } = answer.error;
            setProblem(
              code === "check_in_not_open" && opens !== undefined
                ? t("tripDay.opensAt", { time: formatClock(new Date(opens)) })
                : code === "check_in_closed"
                  ? t("tripDay.closed")
                  : code === "network_error"
                    ? errorText(t, answer)
                    : t("tripDay.imHereFailed"),
            );
          });
        }}
      />
      <Notice message={problem} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
});
