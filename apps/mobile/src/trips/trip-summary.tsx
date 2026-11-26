import type { MyTrip } from "@shareride/contracts";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { Text } from "react-native";
import { Card } from "@/components/card";
import { useLanguage } from "@/i18n/language";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { routeText } from "./texts";

/** A driver's trip in a card: its route and when it leaves, as after publishing. */
export function TripSummary({ trip }: { readonly trip: MyTrip }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const departure = trip.departsAt === null ? null : new Date(trip.departsAt);
  return (
    <Card>
      <Text style={[typography.heading, { color: palette.text }]}>
        {routeText(t, locale, trip)}
      </Text>
      {departure === null ? null : (
        <Text style={[typography.body, { color: palette.textMuted }]}>
          {capitalised(
            t("trip.mine.when", {
              day: formatDay(departure, locale),
              time: formatClock(departure),
            }),
            locale,
          )}
        </Text>
      )}
    </Card>
  );
}
