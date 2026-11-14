import type { MyTrip } from "@shareride/contracts";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { routeText } from "@/trips/texts";
import { Loading, useDraft } from "@/trips/use-draft";

/**
 * Published (spec 3, screen 10). Sharing the trip and posting the return
 * trip come with the trip page (spec 4) and changes to trips (spec 6).
 */
export default function PublishedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { value: result, reload } = useDraft(id);
  return (
    <Screen>
      {result === undefined || !result.ok ? (
        <Loading failure={result} onRetry={reload} />
      ) : (
        <Published trip={result.data} />
      )}
    </Screen>
  );
}

function Published({ trip }: { readonly trip: MyTrip }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const departure = trip.departsAt === null ? null : new Date(trip.departsAt);
  return (
    <>
      <Title>{t("trip.published.title")}</Title>
      <Body>
        {trip.bookingMode === "approval"
          ? t("trip.published.approval")
          : t("trip.published.instant")}
      </Body>
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
      <Button
        label={t("trip.published.seeTrips")}
        onPress={() => {
          router.replace("/drive/trips");
        }}
      />
    </>
  );
}
