import { soonestTripsRoute, type TripSearchResult } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { BetaLabel } from "@/beta/config";
import { Card } from "@/components/card";
import { Columns } from "@/components/columns";
import { Grid } from "@/components/grid";
import { Notice } from "@/components/notice";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { PuffinsInCar } from "@/components/puffin-scenes";
import { Screen, useWideScreen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { refreshFrontPage, useFrontPageRefreshes } from "@/navigation/front-page-refresh";
import { RideItem } from "@/my-rides/ride-row";
import { SuspendedAccount, suspensionNow } from "@/safety/suspended-account";
import { useRides } from "@/my-rides/use-rides";
import { FindMap } from "@/search/find-map";
import { ResultCard } from "@/search/result-card";
import { openSearch, useRouteSearch } from "@/search/route-search";
import { minTouchTarget, sizes, spacing, typography } from "@/theme/tokens";
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
 * ride when signed in, two puffins in a round car over the title (spec 15,
 * 5.3), a route search with the seats, the rides leaving soon (spec 4, 3.8)
 * and "Offer a ride". Signing in is in the menu.
 *
 * A wide screen (spec 18, 3.5) has the search in one row across the page,
 * then the rides in a grid, closed by the offer as one line, with Your
 * next ride and our map in a column beside them. The map shows the meeting
 * points and one ride's road: the first ride, or the one the pointer or
 * the keyboard came to last. The column is there from the start, so
 * nothing moves when the rides come; with no rides the offer is a card
 * where they would be.
 *
 * Pulling down, or pressing the logo, loads the rides and Your next ride
 * again (spec 16, 3.9).
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
  const { value, pull } = useLoaded(load);
  const rides = value?.ok === true ? value.data.results : [];
  const mine = useRides("upcoming", me !== null);
  const refresh = async () => {
    const [soonest, next] = await Promise.all([
      pull((loaded) => loaded.ok),
      me === null ? Promise.resolve(null) : mine.pull(),
    ]);
    return soonest === false || next === false ? false : (soonest ?? next);
  };
  const refreshAsked = useFrontPageRefreshes();
  // The ride the pointer or the keyboard came to last, for the map.
  const [shownId, setShownId] = useState<string | null>(null);
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
    <View testID="title-line" style={wide ? styles.introWide : styles.intro}>
      <PuffinsInCar width={wide ? sizes.sceneCarSmall : sizes.sceneCar} />
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
    const listed = rides.slice(0, shown);
    const onMap = listed.find((ride) => ride.tripId === shownId) ?? listed[0];
    const headed = value === undefined || rides.length > 0;
    // Beside "Leaving soon", a row as high: the map then starts where the
    // cards do, as the ride under "Your next ride" does. Without the
    // heading, the map starts with the offer card.
    const level = headed ? <View testID="map-level" style={styles.head} /> : null;
    return (
      <Screen width="page" refresh={refresh} refreshAsked={refreshAsked}>
        {title}
        {route.row(findRide)}
        <Columns
          side={
            <>
              {me === null ? level : <NextRide rides={mine} beside otherwise={level} />}
              <FindMap shown={onMap} />
            </>
          }
        >
          {headed ? (
            <>
              <LeavingSoon
                rides={rides}
                shown={shown}
                grid
                loading={value === undefined}
                onMap={{ shown: onMap?.tripId, onShow: setShownId }}
              />
              {/* Once the rides are there, so it does not move when they come. */}
              {value === undefined ? null : (
                <View testID="offer-line" style={styles.offerLine}>
                  <View style={styles.offerText}>
                    <Body align="start">{t("nav.offerSignedOut")}</Body>
                  </View>
                  <Button
                    variant="text"
                    label={t("driver.offerRide")}
                    onPress={() => {
                      offerRide(me);
                    }}
                  />
                </View>
              )}
            </>
          ) : (
            <Card>
              <Body align="start">{t("nav.offerSignedOut")}</Body>
              {/* In a row, so the button starts at the left with the text. */}
              <View style={styles.offerAction}>{offer}</View>
            </Card>
          )}
        </Columns>
      </Screen>
    );
  }
  return (
    <Screen refresh={refresh} refreshAsked={refreshAsked}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("nav.refreshHome")}
            onPress={refreshFrontPage}
            style={styles.logo}
          >
            <Logo size={sizes.logoSmall} />
            <Text style={[typography.heading, { color: palette.text }]}>{t("app.name")}</Text>
          </Pressable>
          <BetaLabel />
        </View>
        <LanguageSwitch onSwitch={saveLanguage} />
      </View>
      {me === null ? null : <NextRide rides={mine} />}
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
 * "Leaving soon" in the main column. `otherwise` stands in its place while
 * it has no ride to show, so what follows keeps its level.
 */
function NextRide({
  rides,
  beside = false,
  otherwise = null,
}: {
  /** My rides coming up, which the front page loads, to load them again too. */
  readonly rides: ReturnType<typeof useRides>;
  readonly beside?: boolean;
  readonly otherwise?: ReactNode;
}) {
  const { t } = useLanguage();
  const { loaded, reload } = rides;
  if (loaded === undefined) return otherwise;
  if ("failure" in loaded) {
    return (
      <View style={beside ? styles.nextBeside : styles.next}>
        <Notice message={t("home.nextRideFailed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </View>
    );
  }
  const [next] = loaded.rides;
  if (next === undefined) return otherwise;
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
 * With `onMap`, beside the map of a wide page, a card tells when the
 * pointer or the keyboard comes to it, and the one whose ride the map
 * shows is marked.
 */
function LeavingSoon({
  rides,
  shown,
  grid = false,
  loading = false,
  onMap,
}: {
  readonly rides: readonly TripSearchResult[];
  readonly shown: number;
  readonly grid?: boolean;
  readonly loading?: boolean;
  readonly onMap?: {
    /** The ride the map shows. */
    readonly shown: string | undefined;
    readonly onShow: (tripId: string) => void;
  };
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
  const cards = rides.slice(0, shown).map((ride) => (
    <ResultCard
      key={ride.tripId}
      result={ride}
      searched={{ from: "", to: "" }}
      seats={1}
      showDay
      fill={grid}
      marked={onMap?.shown === ride.tripId}
      onShow={
        onMap === undefined
          ? undefined
          : () => {
              onMap.onShow(ride.tripId);
            }
      }
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
  logo: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  intro: { gap: spacing.md, paddingVertical: spacing.lg },
  // On a wide page the car is on the title's line, taking the room over and
  // under the title: the line is no higher than the title alone was, so the
  // map beside the rides stays whole in a window 720 high (spec 18).
  introWide: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.ms,
  },
  next: { gap: spacing.sm, paddingTop: spacing.md },
  nextBeside: { gap: spacing.md },
  rides: { gap: spacing.md },
  // As high as a text button, so a heading with a link and one without are level.
  head: { minHeight: minTouchTarget, justifyContent: "center" },
  headWithLink: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actions: { gap: spacing.sm, paddingTop: spacing.lg },
  offerAction: { flexDirection: "row" },
  // The sentence, then the link right after it; a narrow column puts the
  // link under it, its label starting where the sentence does. A text
  // button has room around its label, so the line starts that much earlier.
  offerLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginLeft: -spacing.sm,
  },
  offerText: { flexShrink: 1, paddingHorizontal: spacing.sm },
});
