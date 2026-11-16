import type { TripDetails } from "@shareride/contracts";
import { capitalised, formatClock, formatDay, formatMoney, type Translate } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { useLanguage } from "@/i18n/language";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import type { KeptRide } from "./kept-ride";

/** Why the part kept can no longer be booked as chosen, or null while it can. */
function partNotOpenText(t: Translate, part: TripDetails["part"]): string | null {
  switch (part.state) {
    case "open":
      return null;
    case "full":
      return part.freeSeats === 0
        ? t("trip.fullOnPart")
        : t("trip.tooFewSeats", { count: part.freeSeats });
    case "closed":
      return t("trip.closed");
    case "departed":
      return t("trip.departed");
    case "cancelled":
      return t("trip.cancelled");
    case "own":
      return t("trip.own");
  }
}

interface Lines {
  readonly title: string | null;
  readonly main: string;
  readonly details: string | null;
  /** What happens next, or why the ride can no longer be booked as chosen. */
  readonly last: string | null;
  /** The card's one name for screen readers, in words rather than "·" and "→". */
  readonly label: string;
}

/**
 * The ride kept through signing up, at the top of each step (spec 16, 3.5
 * item 3): "You're booking" with the day, times, route, seats, price and
 * driver, or "Next: offer a ride". A part that filled up, closed or was
 * cancelled meanwhile says so instead of promising to come back to it.
 * Nothing while it loads, when nothing is kept, or when the trip could not
 * be loaded. `compact` (the last step, which is long) keeps only the day,
 * times and route.
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
  const lines = ((): Lines | null => {
    if (kept?.kind === "offer") {
      const main = t("signIn.keptOffer");
      const last = compact ? null : t("signIn.keptOfferBack");
      return {
        title: null,
        main,
        details: null,
        last,
        label: [main, last].filter(Boolean).join(", "),
      };
    }
    if (kept?.kind !== "booking" || kept.trip === null) return null;
    const { trip } = kept;
    const board = trip.stops[trip.part.board];
    const alight = trip.stops[trip.part.alight];
    if (board === undefined || alight === undefined) return null;
    const boardsAt = new Date(board.plannedAt);
    const day = capitalised(formatDay(boardsAt, locale), locale);
    const times = {
      boardTime: formatClock(boardsAt),
      board: board.meetingPoint.name[locale],
      alightTime: formatClock(new Date(alight.plannedAt)),
      alight: alight.meetingPoint.name[locale],
    };
    const seats = t("search.seatCount", { count: trip.part.seats });
    const price =
      trip.part.total.amount === 0 ? t("results.free") : formatMoney(trip.part.total, locale);
    const driver = trip.driver.firstName;
    const notOpen = partNotOpenText(t, trip.part);
    const last = notOpen ?? (compact ? null : t("signIn.keptRideBack"));
    const spoken = [
      t("signIn.keptRide"),
      day,
      t("results.boards", { name: times.board, time: times.boardTime }),
      t("results.alights", { name: times.alight, time: times.alightTime }),
      ...(compact ? [] : [seats, price, t("signIn.keptRideDriver", { driver })]),
      last,
    ];
    return {
      title: t("signIn.keptRide"),
      main: t("signIn.keptRideTrip", { day, ...times }),
      details: compact ? null : t("signIn.keptRideDetails", { seats, price, driver }),
      last,
      label: spoken.filter((part) => part !== null).join(", "),
    };
  })();
  if (lines === null) return null;
  return (
    <View testID="kept-ride" accessible accessibilityLabel={lines.label} style={styles.card}>
      <Card>
        {lines.title === null ? null : (
          <Text style={[typography.label, { color: palette.textMuted }]}>{lines.title}</Text>
        )}
        <Text style={[typography.bodyStrong, { color: palette.text }]}>{lines.main}</Text>
        {lines.details === null ? null : (
          <Text style={[typography.body, { color: palette.text }]}>{lines.details}</Text>
        )}
        {lines.last === null ? null : (
          <Text style={[typography.small, { color: palette.textMuted }]}>{lines.last}</Text>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({ card: { alignSelf: "stretch" } });
