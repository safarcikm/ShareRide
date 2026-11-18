import { soonestTripsRoute, type TripSearchResult } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Columns } from "@/components/columns";
import { Grid } from "@/components/grid";
import { Notice } from "@/components/notice";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { Screen, useWideScreen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { RideItem } from "@/my-rides/ride-row";
import { SuspendedAccount, suspensionNow } from "@/safety/suspended-account";
import { useRides } from "@/my-rides/use-rides";
import { ResultCard } from "@/search/result-card";
import { openSearch, useRouteSearch } from "@/search/route-search";
import { maxContentWidth, minTouchTarget, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Rides on the front page; one more is asked for, to know whether there are
 * others. A wide page shows six, which fill the two columns its grid has
 * where they fit, from about 1140 wide; under that they are one column.
 */
const shownRides = 5;
const shownRidesWide = 6;

/**
 * Find, the home of the app for everyone, signed in or not (spec 16, 3.2):
 * the logo and the language (in the top bar on wide screens), Your next
 * ride when signed in, a route search with the seats, the rides leaving soon (spec 4, 3.8) and "Offer a
 * ride". Signing in is in the menu.
 *
 * A wide screen (spec 18, 3.5) has the search in one row across the page,
 * then the rides in a grid with Your next ride and the offer in a column
 * beside them, there from the start so nothing moves when the rides come;
 * with no rides, those two sit in the middle under the search.
 */
export default function FindScreen() {
  const suspension = suspensionNow(useMe());
  // Searching is closed to a suspended person (spec 9, 3.6.2).
  if (suspension !== null) return <SuspendedAccount suspension={suspension} />;
  return <FrontPage />;
}

function FrontPage() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const me = useMe();
  const saveLanguage = useSaveLanguage();
  const palette = usePalette();
  const wide = useWideScreen();
  const shown = wide ? shownRidesWide : shownRides;
  const load = useCallback(
    () => session.call(soonestTripsRoute, { query: { limit: shown + 1 } }),
    [session, shown],
  );
  const { value } = useLoaded(load);
  const rides = value?.ok === true ? value.data.results : [];
  const route = useRouteSearch((query) => {
    void openSearch(query, locale);
  });
  const findRide = (
    <Button
      label={t("welcome.findRide")}
      onPress={() => {
        route.submit();
      }}
    />
  );
  const title = (
    <View style={styles.intro}>
      <Title>{t("home.title")}</Title>
    </View>
  );
  const offer = (
    <Button
      variant="secondary"
      label={t("driver.offerRide")}
      onPress={() => {
        offerRide(me);
      }}
    />
  );
  const meetingPoints = (
    <Button
      variant="text"
      label={t("meetingPoints.open")}
      onPress={() => {
        router.push("/meeting-points");
      }}
    />
  );
  if (wide) {
    const side = (
      <>
        {me === null ? null : <NextRide beside />}
        <Card>
          <Body align="start">{t("nav.offerSignedOut")}</Body>
          {/* In a row, so the buttons start at the left with the text. */}
          <View style={styles.offerActions}>
            {offer}
            {meetingPoints}
          </View>
        </Card>
      </>
    );
    return (
      <Screen width="page">
        {title}
        {route.row(findRide)}
        {value === undefined || rides.length > 0 ? (
          <Columns side={side}>
            <LeavingSoon rides={rides} shown={shown} grid loading={value === undefined} />
          </Columns>
        ) : (
          <View testID="find-middle" style={styles.middle}>
            {side}
          </View>
        )}
      </Screen>
    );
  }
  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Logo size={sizes.logoSmall} />
          <Text style={[typography.heading, { color: palette.text }]}>{t("app.name")}</Text>
        </View>
        <LanguageSwitch onSwitch={saveLanguage} />
      </View>
      {me === null ? null : <NextRide />}
      {title}
      {route.fields}
      {findRide}
      <LeavingSoon rides={rides} shown={shown} />
      <View style={styles.actions}>
        <Body>{t("nav.offerSignedOut")}</Body>
        {offer}
        {meetingPoints}
      </View>
    </Screen>
  );
}

/**
 * Your next ride, signed in (spec 16, 3.2 item 2): the soonest of My rides
 * coming up, a ride under way included, as My rides shows it. Left out when
 * nothing is coming up; one notice with a retry when it can't be loaded.
 * `beside`: in the side column of a wide page, its heading level with
 * "Leaving soon" in the main column.
 */
function NextRide({ beside = false }: { readonly beside?: boolean }) {
  const { t } = useLanguage();
  const { loaded, reload } = useRides("upcoming");
  if (loaded === undefined) return null;
  if ("failure" in loaded) {
    return (
      <View style={beside ? styles.nextBeside : styles.next}>
        <Notice message={t("home.nextRideFailed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </View>
    );
  }
  const [next] = loaded.rides;
  if (next === undefined) return null;
  return (
    <View style={beside ? styles.nextBeside : styles.next}>
      {beside ? (
        <View style={styles.head}>
          <Heading>{t("home.nextRide")}</Heading>
        </View>
      ) : (
        <Heading>{t("home.nextRide")}</Heading>
      )}
      <RideItem ride={next} at={now()} />
    </View>
  );
}

/**
 * The rides leaving soonest, each for its whole route (spec 4, 3.8): five,
 * or six in a `grid` on a wide page, with "See all rides" when there are
 * more, under the rides or, in a grid, at the right of the heading. Left
 * out when there are none and when they can't be loaded: the page works
 * without them. While `loading`, a wide page shows the heading and that
 * they are on their way; a phone leaves them out until they are there.
 */
function LeavingSoon({
  rides,
  shown,
  grid = false,
  loading = false,
}: {
  readonly rides: readonly TripSearchResult[];
  readonly shown: number;
  readonly grid?: boolean;
  readonly loading?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  if (loading) {
    return (
      <View style={styles.rides}>
        <View style={styles.head}>
          <Heading>{t("welcome.soon")}</Heading>
        </View>
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </View>
    );
  }
  if (rides.length === 0) return null;
  const cards = rides
    .slice(0, shown)
    .map((ride) => (
      <ResultCard
        key={ride.tripId}
        result={ride}
        searched={{ from: "", to: "" }}
        seats={1}
        showDay
        fill={grid}
      />
    ));
  const all =
    rides.length > shown ? (
      <Button
        variant="text"
        label={t("welcome.allRides")}
        onPress={() => {
          router.push("/rides");
        }}
      />
    ) : null;
  if (grid) {
    return (
      <View style={styles.rides}>
        <View style={[styles.head, styles.headWithLink]}>
          <Heading>{t("welcome.soon")}</Heading>
          {all}
        </View>
        <Grid>{cards}</Grid>
      </View>
    );
  }
  return (
    <View style={styles.rides}>
      <Heading>{t("welcome.soon")}</Heading>
      {cards}
      {all}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  intro: { gap: spacing.md, paddingVertical: spacing.lg },
  next: { gap: spacing.sm, paddingTop: spacing.md },
  nextBeside: { gap: spacing.md },
  rides: { gap: spacing.md },
  // As high as a text button, so a heading with a link and one without are level.
  head: { minHeight: minTouchTarget, justifyContent: "center" },
  headWithLink: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actions: { gap: spacing.sm, paddingTop: spacing.lg },
  offerActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  middle: { width: "100%", maxWidth: maxContentWidth, alignSelf: "center", gap: spacing.md },
});
