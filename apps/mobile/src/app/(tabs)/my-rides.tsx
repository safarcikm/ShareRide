import { router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe } from "@/auth/session";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { PageColumn } from "@/components/columns";
import { Grid } from "@/components/grid";
import { Notice } from "@/components/notice";
import { Screen, useWideScreen } from "@/components/screen";
import { PuffinByPin } from "@/components/puffin-scenes";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useClock } from "@/lib/use-clock";
import { MyRideTicket } from "@/my-rides/my-ride-ticket";
import { needing, needOf, rideKey, type Ride, type When } from "@/my-rides/rides";
import { useRides } from "@/my-rides/use-rides";
import { SignInFirst } from "@/navigation/sign-in-first";
import { sizes, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * My rides, a place of the menu (spec 16, 3.3): my bookings and the rides I
 * drive in one list of tickets (spec 31, 3.10), coming up or past. Coming
 * up puts what needs me first.
 * Which list shows lives in the address, so Back returns to it. Pulling
 * down loads it again (3.9). Signed out, it asks to sign in.
 *
 * On a wide screen (spec 18, 3.10) it is a page: the title and the choice
 * start at the left, and the rides are a grid in the same order. What
 * stands in the rides' place, when there are none or they cannot be
 * loaded, keeps the width of a column at the page's left.
 */
export default function MyRidesScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return <SignInFirst title={t("nav.myRidesSignedOut")} />;
  return <MyRides />;
}

function MyRides() {
  const { t } = useLanguage();
  const palette = usePalette();
  const params = useLocalSearchParams<{ when?: string }>();
  const when: When = params.when === "past" ? "past" : "upcoming";
  const { loaded, reload, pull } = useRides(when);
  const wide = useWideScreen();
  // What a ride needs counts down ("Leaves in 40 minutes") while the list is open.
  const at = useClock();

  return (
    <Screen width="page" refresh={pull}>
      <Title align={wide ? "start" : "center"}>{t("nav.myRides")}</Title>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("myRides.which")}
        style={styles.chips}
      >
        {(["upcoming", "past"] as const).map((option) => (
          <Chip
            key={option}
            role="radio"
            label={t(option === "upcoming" ? "myRides.comingUp" : "myRides.past")}
            selected={when === option}
            onToggle={() => {
              router.setParams({ when: option });
            }}
          />
        ))}
      </View>
      {loaded === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : "failure" in loaded ? (
        <Instead wide={wide}>
          <Notice
            message={
              loaded.failure.error.code === "network_error"
                ? errorText(t, loaded.failure)
                : t("myRides.failed")
            }
          />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </Instead>
      ) : when === "upcoming" ? (
        <ComingUp rides={loaded.rides} at={at} wide={wide} />
      ) : loaded.rides.length === 0 ? (
        <Instead wide={wide}>
          <Body align={wide ? "start" : "center"}>{t("myRides.nonePast")}</Body>
        </Instead>
      ) : (
        <Rides rides={loaded.rides} at={at} grid={wide} />
      )}
    </Screen>
  );
}

/**
 * What needs me under "Needs you", the soonest need first (spec 31, 3.3
 * item 3), then the rest, soonest first (3.3 items 2 and 3), or Find a
 * ride and Offer a ride when nothing is coming up. A ticket says in its
 * foot what the ride needs, and opens where that is done.
 */
function ComingUp({
  rides,
  at,
  wide,
}: {
  readonly rides: readonly Ride[];
  readonly at: Date;
  readonly wide: boolean;
}) {
  const { t } = useLanguage();
  const me = useMe();
  if (rides.length === 0) {
    const nothing = (
      <View style={styles.nothing}>
        <PuffinByPin height={sizes.scenePuffin} align={wide ? "start" : "center"} />
        <Body align={wide ? "start" : "center"}>{t("myRides.nothing")}</Body>
        <Button
          label={t("welcome.findRide")}
          onPress={() => {
            router.navigate("/");
          }}
        />
        <Button
          variant="secondary"
          label={t("driver.offerRide")}
          onPress={() => {
            offerRide(me);
          }}
        />
      </View>
    );
    return <Instead wide={wide}>{nothing}</Instead>;
  }
  const needsMe = needing(rides, at).map(({ ride }) => ride);
  const rest = rides.filter((ride) => needOf(ride, at) === null);
  if (needsMe.length === 0) return <Rides rides={rest} at={at} grid={wide} />;
  return (
    <>
      <Heading>{t("myRides.needsYou")}</Heading>
      <Rides rides={needsMe} at={at} grid={wide} />
      {rest.length === 0 ? null : (
        <>
          <Heading>{t("myRides.comingUp")}</Heading>
          <Rides rides={rest} at={at} grid={wide} />
        </>
      )}
    </>
  );
}

/** The rides as tickets one under the other, or as a `grid` on a wide page, in the same order. */
function Rides({
  rides,
  at,
  grid,
}: {
  readonly rides: readonly Ride[];
  readonly at: Date;
  readonly grid: boolean;
}) {
  const items = rides.map((ride) => (
    <MyRideTicket key={rideKey(ride)} ride={ride} at={at} fill={grid} />
  ));
  return grid ? <Grid>{items}</Grid> : items;
}

/** What stands in the rides' place: on a wide page, a column at its left. */
function Instead({ wide, children }: { readonly wide: boolean; readonly children: ReactNode }) {
  return wide ? <PageColumn>{children}</PageColumn> : children;
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  nothing: { gap: spacing.sm },
});
