import type { MyTrip } from "@shareride/contracts";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ShareNotice } from "@/components/share-notice";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { shareLink, type Shared } from "@/lib/share";
import { NotificationsPrompt } from "@/notifications/notifications-prompt";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { tripHref, tripWebAddress } from "@/trip-details/trip-link";
import { routeText } from "@/trips/texts";
import { Loading, useDraft } from "@/trips/use-draft";

/**
 * Published (spec 3, screen 10): share the trip's page, or see it as
 * passengers do, and the prompt to turn on notifications (spec 7, 3.6.2).
 * Posting the return trip comes with changes to trips (spec 6).
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
  const [shared, setShared] = useState<Shared | null>(null);
  const departure = trip.departsAt === null ? null : new Date(trip.departsAt);
  const whole = { board: 0, alight: trip.stops.length - 1 };
  const share = async () => {
    const url = tripWebAddress(trip.id, whole);
    const outcome = await shareLink(
      url,
      t("trip.shareText", { route: routeText(t, locale, trip) }),
    );
    setShared({ outcome, url });
  };
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
      <NotificationsPrompt occasion={`posted:${trip.id}`} />
      <Button
        variant="secondary"
        label={t("trip.published.share")}
        onPress={() => {
          void share();
        }}
      />
      <ShareNotice shared={shared} />
      <TextLink label={t("trip.published.see")} href={tripHref(trip.id, whole)} />
      <Button
        label={t("trip.published.seeTrips")}
        onPress={() => {
          router.replace("/drive/trips");
        }}
      />
    </>
  );
}
