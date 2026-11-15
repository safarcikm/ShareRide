import { soonestTripsRoute, type TripSearchResult } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { Screen, useWideScreen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { useLoaded } from "@/lib/use-loaded";
import { ResultCard } from "@/search/result-card";
import { openSearch, useRouteSearch } from "@/search/route-search";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** Rides on the front page; one more is asked for, to know whether there are others. */
const shownRides = 5;

/**
 * Find, the home of the app for everyone, signed in or not (spec 16, 3.2):
 * the logo and the language (in the top bar on wide screens), a route
 * search with the seats, the rides leaving soon (spec 4, 3.8) and "Offer a
 * ride". Signing in is in the menu.
 */
export default function FindScreen() {
  return <FrontPage />;
}

function FrontPage() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const me = useMe();
  const saveLanguage = useSaveLanguage();
  const palette = usePalette();
  const wide = useWideScreen();
  const load = useCallback(
    () => session.call(soonestTripsRoute, { query: { limit: shownRides + 1 } }),
    [session],
  );
  const { value } = useLoaded(load);
  const rides = value?.ok === true ? value.data.results : [];
  const route = useRouteSearch((query) => {
    void openSearch(query, locale);
  });
  return (
    <Screen>
      {wide ? null : (
        <View style={styles.top}>
          <View style={styles.brand}>
            <Logo size={sizes.logoSmall} />
            <Text style={[typography.heading, { color: palette.text }]}>{t("app.name")}</Text>
          </View>
          <LanguageSwitch onSwitch={saveLanguage} />
        </View>
      )}
      <View style={styles.intro}>
        <Title>{t("home.title")}</Title>
      </View>
      {route.fields}
      <Button
        label={t("welcome.findRide")}
        onPress={() => {
          route.submit();
        }}
      />
      <LeavingSoon rides={rides} />
      <View style={styles.actions}>
        <Body>{t("nav.offerSignedOut")}</Body>
        <Button
          variant="secondary"
          label={t("driver.offerRide")}
          onPress={() => {
            offerRide(me);
          }}
        />
        <Button
          variant="text"
          label={t("meetingPoints.open")}
          onPress={() => {
            router.push("/meeting-points");
          }}
        />
      </View>
    </Screen>
  );
}

/**
 * The five rides leaving soonest, each for its whole route (spec 4, 3.8).
 * Left out while loading, when there are none and when they can't be
 * loaded: the page works without them.
 */
function LeavingSoon({ rides }: { readonly rides: readonly TripSearchResult[] }) {
  const { t } = useLanguage();
  if (rides.length === 0) return null;
  return (
    <View style={styles.rides}>
      <Heading>{t("welcome.soon")}</Heading>
      {rides.slice(0, shownRides).map((ride) => (
        <ResultCard
          key={ride.tripId}
          result={ride}
          searched={{ from: "", to: "" }}
          seats={1}
          showDay
        />
      ))}
      {rides.length > shownRides ? (
        <Button
          variant="text"
          label={t("welcome.allRides")}
          onPress={() => {
            router.push("/rides");
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  intro: { gap: spacing.md, paddingVertical: spacing.lg },
  rides: { gap: spacing.md },
  actions: { gap: spacing.sm, paddingTop: spacing.lg },
});
