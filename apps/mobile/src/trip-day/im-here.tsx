import type { CallFailure } from "@shareride/api-client";
import { formatClock } from "@shareride/i18n";
import { CircleCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { TakesFocus } from "@/components/takes-focus";
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
 * asks the API; `onSaid` loads the page again with what it stored. When the
 * booking or trip changed meanwhile (cancelled, or no longer confirmed),
 * trying again cannot work, so `onStale` says why and loads it again.
 *
 * It remembers that it was said until the page has loaded again. A screen
 * that moves it, as between a phone's bar and a wide screen's side column,
 * remembers that itself and gives it as `said`; it also hears through
 * `onSaidFocused` that focus went to what was told, and then gives
 * `focusSaid` false, so moving it does not take focus again.
 *
 * A driver's bar can hold more than one stop (spec 31, 3.9, item 4): each
 * names its stop in its `label` and in when it `opens`, and only the first
 * is the screen's main button; the others are `outlined` (R31.1).
 */
export function ImHere({
  state,
  told,
  label,
  opens,
  outlined = false,
  send,
  said,
  focusSaid = true,
  onSaidFocused,
  onSaid,
  onStale,
}: {
  readonly state: CheckInState;
  /** What saying it did: the driver, or the passengers getting in there, were told. */
  readonly told: string;
  /** On the button, in place of "I'm here": with the stop, where there are several. */
  readonly label?: string;
  /** When it opens, in words, in place of "You can say you're here from 08:45." */
  readonly opens?: (time: string) => string;
  /** Not the screen's main button: another one stands over it. */
  readonly outlined?: boolean;
  readonly send: () => Promise<
    { readonly ok: true; readonly data: { checkedInAt: string } } | CallFailure
  >;
  /** When it was said on this screen, where the screen keeps that; null before. */
  readonly said?: string | null;
  /** Whether what was said here still takes focus as it appears. */
  readonly focusSaid?: boolean;
  readonly onSaidFocused?: () => void;
  readonly onSaid: (checkedInAt: string) => void;
  readonly onStale: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [sending, setSending] = useState(false);
  // Said here, before the page loads again with it.
  const [saidHere, setSaidHere] = useState<string | null>(null);
  const saidAt = said === undefined ? saidHere : said;
  const [problem, setProblem] = useState<string | null>(null);

  if (state.at !== null || saidAt !== null) {
    // Said on this screen, the button just pressed is gone: focus moves here.
    return (
      <TakesFocus
        when={saidAt !== null && focusSaid}
        {...(onSaidFocused === undefined ? {} : { onFocused: onSaidFocused })}
      >
        <View style={styles.row} accessible accessibilityLiveRegion="polite">
          <Icon icon={CircleCheck} color={palette.primary} />
          <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>{told}</Text>
        </View>
      </TakesFocus>
    );
  }
  const time = now();
  const opensAt = new Date(state.opensAt);
  if (time > new Date(state.closesAt))
    return problem === null ? null : <Notice message={problem} />;
  if (time < opensAt && problem === null) {
    const clock = formatClock(opensAt);
    return (
      <Body align="start">
        {opens === undefined ? t("tripDay.opensAt", { time: clock }) : opens(clock)}
      </Body>
    );
  }
  return (
    <>
      <Button
        main={!outlined}
        fill={outlined}
        variant={outlined ? "secondary" : "primary"}
        label={label ?? t("tripDay.imHere")}
        busy={sending}
        onPress={() => {
          setSending(true);
          setProblem(null);
          void send().then((answer) => {
            setSending(false);
            if (answer.ok) {
              setSaidHere(answer.data.checkedInAt);
              onSaid(answer.data.checkedInAt);
              return;
            }
            const { code, opensAt: opens } = answer.error;
            if (code === "not_confirmed" || code === "trip_not_running" || code === "not_found") {
              onStale();
              return;
            }
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
