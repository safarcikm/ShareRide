import { capitalised, formatClock, formatDay, formatMoney } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { useLanguage } from "@/i18n/language";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import type { KeptRide } from "./kept-ride";

/**
 * The ride kept through signing up, at the top of each step (spec 16, 3.5
 * item 3): "You're booking" with the day, times, route, seats, price and
 * driver, or "Next: offer a ride". Nothing while it loads, when nothing is
 * kept, or when the trip could not be loaded. `compact` (the last step,
 * which is long) leaves out all but the day, times and route. One name for
 * screen readers.
 */
export function KeptRideCard({
  kept,
  compact = false,
}: {
  readonly kept: KeptRide | undefined;
  readonly compact?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const lines = (() => {
    if (kept?.kind === "offer") {
      return {
        title: null,
        main: t("signIn.keptOffer"),
        details: null,
        back: compact ? null : t("signIn.keptOfferBack"),
      };
    }
    if (kept?.kind !== "booking" || kept.trip === null) return null;
    const { trip } = kept;
    const board = trip.stops[trip.part.board];
    const alight = trip.stops[trip.part.alight];
    if (board === undefined || alight === undefined) return null;
    const boardsAt = new Date(board.plannedAt);
    return {
      title: t("signIn.keptRide"),
      main: t("signIn.keptRideTrip", {
        day: capitalised(formatDay(boardsAt, locale), locale),
        boardTime: formatClock(boardsAt),
        board: board.meetingPoint.name[locale],
        alightTime: formatClock(new Date(alight.plannedAt)),
        alight: alight.meetingPoint.name[locale],
      }),
      details: compact
        ? null
        : t("signIn.keptRideDetails", {
            seats: t("search.seatCount", { count: trip.part.seats }),
            price:
              trip.part.total.amount === 0
                ? t("results.free")
                : formatMoney(trip.part.total, locale),
            driver: trip.driver.firstName,
          }),
      back: compact ? null : t("signIn.keptRideBack"),
    };
  })();
  if (lines === null) return null;
  const label = [lines.title, lines.main, lines.details, lines.back]
    .filter((line) => line !== null)
    .join(", ");
  return (
    <View testID="kept-ride" accessible accessibilityLabel={label} style={styles.card}>
      <Card>
        {lines.title === null ? null : (
          <Text style={[typography.label, { color: palette.textMuted }]}>{lines.title}</Text>
        )}
        <Text style={[typography.bodyStrong, { color: palette.text }]}>{lines.main}</Text>
        {lines.details === null ? null : (
          <Text style={[typography.body, { color: palette.text }]}>{lines.details}</Text>
        )}
        {lines.back === null ? null : (
          <Text style={[typography.small, { color: palette.textMuted }]}>{lines.back}</Text>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({ card: { alignSelf: "stretch" } });
