import { soonestTripsRoute, type TripSearchResult } from "@shareride/contracts";
import { pageText } from "@shareride/i18n";
import { router } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { BetaLabel } from "@/beta/config";
import { sceneTop } from "@/banner/season-looks";
import { useBanner } from "@/banner/use-banner";
import { Card } from "@/components/card";
import { Columns } from "@/components/columns";
import { Grid } from "@/components/grid";
import { NoSnippet } from "@/components/no-snippet";
import { Notice } from "@/components/notice";
import { PageHead } from "@/components/page-head";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { carHeight, IcelandPanel, IcelandScene, PuffinsInCar } from "@/components/puffin-scenes";
import { Screen, useWideScreen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { useClock } from "@/lib/use-clock";
import { useLoaded } from "@/lib/use-loaded";
import { refreshFrontPage, useFrontPageRefreshes } from "@/navigation/front-page-refresh";
import { MyRideTicket } from "@/my-rides/my-ride-ticket";
import { NeedsMeCard } from "@/my-rides/needs-me-card";
import { needing, rideKey, type Ride } from "@/my-rides/rides";
import { SuspendedAccount, suspensionNow } from "@/safety/suspended-account";
import { useRides } from "@/my-rides/use-rides";
import { FindMap } from "@/search/find-map";
import { ResultTicket } from "@/search/result-ticket";
import { openSearch, useRouteSearch } from "@/search/route-search";
import { roomProps, useArrival } from "@/theme/motion";
import { controlOutline, minTouchTarget, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Rides on the front page; one more is asked for, to know whether there are
 * others. A wide page shows six, which fill the two columns its grid has
 * where they fit, from about 1140 wide; under that they are one column.
 */
const shownRides = 5;
const shownRidesWide = 6;

/**
 * Until it is measured, the bottom of a phone's name line and car: the line
 * as high as a touch target, the gap and the car.
 */
const sceneBand = minTouchTarget + spacing.lg + carHeight(sizes.sceneCar);

/** How far the car on a wide page's scene stands from the panel's right edge. */
const carFromEdge = spacing.xxl * 2;

/** The search row's card down to the middle of its fields: the panel ends there. */
const searchRowTop =
  spacing.md + (typography.caption.lineHeight + spacing.xs + sizes.buttonHeight) / 2;

/**
 * Find, the home of the app for everyone, signed in or not (spec 16, 3.2;
 * spec 31, 3.5): the logo and the language (in the top bar on wide
 * screens), two puffins in a round car (spec 15, 5.3), the title, a route
 * search with the seats, the rides leaving soon as tickets (spec 4, 3.8)
 * and "Offer a ride". Signing in is in the menu.
 *
 * Signed out, the title is "Share your ride" with a line under it that
 * says what PuffinRide is. Signed in, it greets by name at the left, and
 * under it stands what needs me, in the yellow card, or else my next ride;
 * when the card is about another ride than my next one, that ride follows
 * the search.
 *
 * A wide screen (spec 18, 3.5; spec 31, 3.16) has the title at the left of
 * the scene with the car at its right, the search in one row across the
 * page, then the rides in a grid with a column beside them: what needs me
 * and my next ride when signed in, "How it works" with the offer when
 * signed out, then our map. The map shows the meeting points and one
 * ride's road: the first ride, or the one the pointer or the keyboard came
 * to last. The column is there from the start, so nothing moves when the
 * rides come; with no rides the offer is a card where they would be.
 *
 * Pulling down, or pressing the logo, loads the rides and Your next ride
 * again (spec 16, 3.9).
 */
export default function FindScreen() {
  const suspension = suspensionNow(useMe());
  // Searching is closed to a suspended person (spec 9, 3.6.2).
  if (suspension !== null) return <SuspendedAccount suspension={suspension} />;
  return (
    <>
      <FindHead />
      <FrontPage />
    </>
  );
}

/** Find's title and description for search engines (spec 23, 3.6). */
function FindHead() {
  const { t } = useLanguage();
  return <PageHead {...pageText(t, { kind: "find" })} />;
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
  // What needs me counts down, and is gone when its deadline passes.
  const at = useClock();
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
  // In the row of a wide page, or as the main button at the end of a
  // phone's search card.
  const findRide = (main: boolean) => (
    <Button
      main={main}
      label={t("welcome.findRide")}
      onPress={() => {
        route.submit();
      }}
    />
  );
  // The Iceland scene behind the top (spec 15, 5.3): on a phone from the
  // screen's top to the road under the car; on a wide page a panel behind
  // the title's line and the top of the search row, the car on its hills.
  // Each grows with what it is measured to hold.
  const { width: windowWidth } = useWindowDimensions();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  // The scene in the season of the day in Iceland, and dressed for a
  // festive day unless the console has turned them off (spec 36, 3.1 to 3.8).
  const { season, day } = useBanner(at);
  const [band, setBand] = useState(sceneBand);
  const [line, setLine] = useState<number>(sizes.sceneLine);
  // The car arrives the first time Find shows on the website (spec 33, 3.2).
  const arriving = useArrival();
  // Someone signed in is greeted by name (spec 31, 3.5); what PuffinRide
  // is, is said to someone new, and until the account has a first name.
  const firstName = me?.firstName ?? null;
  // On a festive day a greeting stands above the title (spec 36, 3.7):
  // centred over a centred title, at the start over one at the left.
  const greeting =
    day === null ? null : (
      <View
        testID="greeting"
        style={[styles.greeting, !wide && firstName === null && styles.greetingCentred]}
      >
        <Tag kind="positive" label={t(`home.greeting.${day}`)} />
      </View>
    );
  const name =
    firstName === null ? (
      <>
        <Title large={wide} align={wide ? "start" : "center"}>
          {t("home.title")}
        </Title>
        <Text style={[typography.body, !wide && styles.introText, { color: palette.text }]}>
          {t("home.intro")}
        </Text>
      </>
    ) : (
      <Title large={wide} align="start">
        {t("home.hi", { name: firstName })}
      </Title>
    );
  const titles = (
    <>
      {greeting}
      {name}
    </>
  );
  const title = wide ? (
    <View
      testID="title-line"
      onLayout={(event) => {
        setLine(event.nativeEvent.layout.height);
      }}
      style={styles.introScene}
    >
      <View style={styles.intro}>{titles}</View>
      {/* The car's room, which the title keeps free: on the website the car
          arrives out of its left edge, never under the words (spec 33, 3.2). */}
      <View testID="car-room" {...roomProps(arriving)} style={styles.carRoom}>
        <View testID="car-on-hills" style={styles.carOnHills}>
          <PuffinsInCar
            day={day}
            season={season}
            width={sizes.sceneCarWide}
            arriveFrom={arriving ? -(sizes.sceneCarWide + spacing.lg) : null}
          />
        </View>
      </View>
    </View>
  ) : (
    <View testID="title-line" style={styles.sceneTitle}>
      <View style={styles.intro}>{titles}</View>
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
  // Links, which search engines follow to the meeting points and to
  // Carpool in Iceland (spec 23, 3.6 and 3.9).
  const meetingPoints = (
    <Button variant="text" label={t("meetingPoints.open")} href="/meeting-points" />
  );
  const howItWorks = <Button variant="text" label={t("home.howItWorks")} href="/carpool-iceland" />;
  if (wide) {
    const listed = rides.slice(0, shown);
    const onMap = listed.find((ride) => ride.tripId === shownId) ?? listed[0];
    const headed = value === undefined || rides.length > 0;
    // Beside "Leaving soon", a row as high: the map then starts where the
    // tickets do, as what stands under "Your next ride" does. Without the
    // heading, the map starts with the offer card.
    const level = headed ? <View testID="map-level" style={styles.head} /> : null;
    const offerRideNow = () => {
      offerRide(me);
    };
    return (
      <Screen
        siteFooter
        width="page"
        refresh={refresh}
        refreshAsked={refreshAsked}
        backdrop={
          <View style={styles.panelRoom}>
            <IcelandPanel
              season={season}
              day={day}
              height={line + spacing.md + searchRowTop}
              ground={line + spacing.sm}
              room={carFromEdge + sizes.sceneCarWide + spacing.lg}
            />
          </View>
        }
      >
        {title}
        {route.row(findRide(false))}
        <Columns
          side={
            <>
              {me === null ? (
                // With no rides the offer is the main column's card already.
                <HowItWorks onOffer={headed ? offerRideNow : null} />
              ) : (
                <>
                  <MineFirst rides={mine} at={at} beside otherwise={level} />
                  <MineNext rides={mine} at={at} beside />
                </>
              )}
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
              {/* Once the rides are there, so it does not move when they come.
                  Signed out, the offer is beside the rides, under "How it works". */}
              {value === undefined || me === null ? null : (
                <View testID="offer-line" style={styles.offerLine}>
                  <View style={styles.offerText}>
                    <Body align="start">{t("nav.offerSignedOut")}</Body>
                  </View>
                  <Button variant="text" label={t("driver.offerRide")} onPress={offerRideNow} />
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
    <Screen
      siteFooter
      refresh={refresh}
      refreshAsked={refreshAsked}
      backdrop={
        <IcelandScene
          season={season}
          day={day}
          width={windowWidth}
          height={spacing.md + band + spacing.sm}
        />
      }
      topColour={sceneTop(season, scheme)}
    >
      <View
        testID="scene-top"
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          setBand(y + height);
        }}
        style={styles.sceneTop}
      >
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
          <View style={styles.language}>
            <LanguageSwitch onSwitch={saveLanguage} />
          </View>
        </View>
        {/* On the website it drives in from beyond the left edge (spec 33, 3.2). */}
        <PuffinsInCar
          day={day}
          season={season}
          width={sizes.sceneCar}
          arriveFrom={arriving ? -(windowWidth + sizes.sceneCar) / 2 - spacing.sm : null}
        />
      </View>
      {title}
      {me === null ? null : <MineFirst rides={mine} at={at} />}
      {route.fields(findRide(true))}
      {me === null ? null : <MineNext rides={mine} at={at} />}
      <LeavingSoon rides={rides} shown={shown} />
      <View style={styles.actions}>
        {/* Signed out the page is centred; signed in, it starts at the left (spec 31, 3.17). */}
        <Body align={me === null ? "center" : "start"}>{t("nav.offerSignedOut")}</Body>
        {offer}
        {meetingPoints}
        {howItWorks}
      </View>
    </Screen>
  );
}

/**
 * What Find shows of my own rides, signed in (spec 31, 3.5): what needs me,
 * the soonest need first, and my next ride, the soonest of My rides coming
 * up, a ride under way included. Null while they load and when they could
 * not be loaded.
 */
function mineOf(rides: ReturnType<typeof useRides>, at: Date) {
  const { loaded } = rides;
  if (loaded === undefined || "failure" in loaded) return null;
  const needs = needing(loaded.rides, at);
  const [first] = needs;
  const [next] = loaded.rides;
  return {
    need: first === undefined ? null : { first, more: needs.length - 1 },
    next: next ?? null,
    /** The card is about another ride than my next one, which then shows apart. */
    nextApart: first !== undefined && next !== undefined && rideKey(next) !== rideKey(first.ride),
  };
}

interface MineProps {
  /** My rides coming up, which the front page loads, to load them again too. */
  readonly rides: ReturnType<typeof useRides>;
  readonly at: Date;
  /**
   * In the side column of a wide page: under a heading whose row is level
   * with "Leaving soon" in the main column.
   */
  readonly beside?: boolean;
}

/**
 * Under the greeting, one of (spec 31, 3.5 item 2): what needs me, as the
 * yellow card, or else my next ride as a ticket. Left out when nothing is
 * coming up; one notice with a retry when my rides can't be loaded.
 * `otherwise` stands in its place while it has nothing to show, so what
 * follows in a side column keeps its level.
 */
function MineFirst({
  rides,
  at,
  beside = false,
  otherwise = null,
}: MineProps & { readonly otherwise?: ReactNode }) {
  const { t } = useLanguage();
  const { loaded, reload } = rides;
  if (loaded !== undefined && "failure" in loaded) {
    return (
      <View style={beside ? styles.mineBeside : styles.mine}>
        <Notice message={t("home.nextRideFailed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </View>
    );
  }
  const mine = mineOf(rides, at);
  const need = mine?.need ?? null;
  if (need !== null) {
    const card = <NeedsMeCard first={need.first} more={need.more} at={at} />;
    // On a phone the card stands right under the greeting, which says whose it is.
    if (!beside) return card;
    return (
      <View style={styles.mineBeside}>
        <View style={styles.head}>
          <Heading>{t("myRides.needsYou")}</Heading>
        </View>
        {card}
      </View>
    );
  }
  const next = mine?.next ?? null;
  if (next === null) return otherwise;
  return <NextRide ride={next} at={at} beside={beside} />;
}

/**
 * "Your next ride" a second time round: only when the yellow card stands
 * above and is about another ride than my next one (spec 31, 3.5 item 2).
 */
function MineNext({ rides, at, beside = false }: MineProps) {
  const mine = mineOf(rides, at);
  if (mine === null || !mine.nextApart || mine.next === null) return null;
  return <NextRide ride={mine.next} at={at} beside={beside} />;
}

/** "Your next ride" over the ride as a ticket, as My rides shows it. */
function NextRide({
  ride,
  at,
  beside,
}: {
  readonly ride: Ride;
  readonly at: Date;
  readonly beside: boolean;
}) {
  const { t } = useLanguage();
  return (
    <View style={beside ? styles.mineBeside : styles.mine}>
      {beside ? (
        <View style={styles.head}>
          <Heading>{t("home.nextRide")}</Heading>
        </View>
      ) : (
        <Heading>{t("home.nextRide")}</Heading>
      )}
      <MyRideTicket ride={ride} at={at} />
    </View>
  );
}

/**
 * For someone new, beside the rides on a wide page (spec 31, 3.16 item 1):
 * what one does here in three steps, each a number, a name and a line, and
 * under a line the offer with "Offer a ride", unless the page says it
 * elsewhere already (`onOffer` null).
 */
function HowItWorks({ onOffer }: { readonly onOffer: (() => void) | null }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const steps = [
    { title: t("welcome.findRide"), text: t("home.how.find") },
    { title: t("home.how.bookTitle"), text: t("home.how.book") },
    { title: t("home.how.meetTitle"), text: t("home.how.meet") },
  ];
  const strong = [typography.bodyStrong, { color: palette.text }];
  const muted = [typography.small, { color: palette.textMuted }];
  return (
    <View testID="how-it-works" style={styles.mineBeside}>
      <View style={styles.head}>
        <Heading>{t("home.how.title")}</Heading>
      </View>
      <Card>
        {steps.map((step, index) => (
          <View key={step.title} style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: palette.primarySoft }]}>
              <Text style={[typography.caption, { color: palette.primary }]}>
                {String(index + 1)}
              </Text>
            </View>
            <View style={styles.stepText}>
              <Text style={strong}>{step.title}</Text>
              <Text style={muted}>{step.text}</Text>
            </View>
          </View>
        ))}
        {onOffer === null ? null : (
          <>
            <View style={[styles.stepLine, { backgroundColor: palette.border }]} />
            <View style={styles.stepOffer}>
              <View style={styles.stepOfferText}>
                <Text style={strong}>{t("home.how.driving")}</Text>
                <Text style={muted}>{t("home.how.offer")}</Text>
              </View>
              <Button variant="secondary" label={t("driver.offerRide")} onPress={onOffer} />
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

/**
 * The rides leaving soonest as tickets, each for its whole route (spec 4,
 * 3.8): five, or six in a `grid` on a wide page, with "See all rides" at
 * the right of the heading when there are more (under the heading where
 * the two do not fit on one line). Left out when there are none and when
 * they can't be loaded: the page works without them. While `loading`, a
 * wide page shows the heading and that they are on their way; a phone
 * leaves them out until they are there. With `onMap`, beside the map of a
 * wide page, a ticket tells when the pointer or the keyboard comes to it,
 * and the one whose ride the map shows is marked.
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
    <ResultTicket
      key={ride.tripId}
      result={ride}
      searched={{ from: "", to: "" }}
      seats={1}
      dayInName
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
  // Drivers' first names: kept out of search engines' snippets (spec 23, 3.4).
  return (
    <NoSnippet style={styles.rides}>
      <View style={[styles.head, styles.headWithLink]}>
        <Heading>{t("welcome.soon")}</Heading>
        {all}
      </View>
      {grid ? <Grid>{cards}</Grid> : cards}
    </NoSnippet>
  );
}

const styles = StyleSheet.create({
  // The name at the left and the language at the right. Where they have no
  // room beside each other, as with large text on a narrow phone, the
  // language goes under the name, still at the right, and Beta under the
  // name before either is cut.
  top: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.sm },
  brand: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
    alignItems: "center",
    columnGap: spacing.sm,
  },
  language: { marginLeft: "auto" },
  logo: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  // On a phone the name, the language and the car stand on the scene, and
  // the title on the screen under it.
  sceneTop: { gap: spacing.lg },
  sceneTitle: { paddingVertical: spacing.sm },
  // On a wide page the title's line is the scene (spec 31, 3.16): the title
  // and its line at the left, kept clear of the car, which drives on the
  // hills at the right, its wheels a little under the line, where the land
  // is. A narrow wide page puts the line under the title on two lines.
  introScene: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: sizes.sceneLine,
    paddingLeft: spacing.xl,
    paddingRight: carFromEdge + sizes.sceneCarWide + spacing.lg,
  },
  carRoom: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: -(spacing.sm + spacing.xs),
    width: carFromEdge + sizes.sceneCarWide + spacing.lg,
    pointerEvents: "none",
  },
  carOnHills: { position: "absolute", right: carFromEdge, bottom: 0 },
  // The title, and under it what PuffinRide is, for someone new. In the
  // text's own colour: on a wide page it stands on the mountains, where the
  // muted one is too faint.
  intro: { flexShrink: 1, gap: spacing.xs },
  // The greeting's tag keeps its own width, in a row of its own.
  greeting: { flexDirection: "row", justifyContent: "flex-start" },
  greetingCentred: { justifyContent: "center" },
  // On a phone both texts stretch across the screen, centred within it.
  introText: { textAlign: "center" },
  // Where the page's own room is, so the panel lines up with the page.
  panelRoom: { paddingTop: spacing.md, paddingHorizontal: spacing.md, alignItems: "center" },
  mine: { gap: spacing.sm },
  mineBeside: { gap: spacing.md },
  rides: { gap: spacing.md },
  // As high as a text button, so a heading with a link and one without are level.
  head: { minHeight: minTouchTarget, justifyContent: "center" },
  // The link goes under the heading where large text leaves no room beside
  // it. Without the link the one line stays in the middle of the row, so
  // the heading is level with the one beside the rides on a wide page.
  headWithLink: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    alignContent: "center",
    columnGap: spacing.sm,
  },
  // A step of "How it works": its number in a round of its own, then its name over its line.
  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.ms },
  stepNumber: {
    width: sizes.avatarSmall,
    height: sizes.avatarSmall,
    borderRadius: sizes.avatarSmall / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { flex: 1 },
  stepLine: { height: controlOutline },
  // The button goes under the words where they do not fit beside it.
  stepOffer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.ms },
  stepOfferText: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: sizes.wordsBeside },
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
