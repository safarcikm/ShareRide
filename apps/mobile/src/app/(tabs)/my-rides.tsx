import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe } from "@/auth/session";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { RideItem } from "@/my-rides/ride-row";
import { needsYou, rideKey, type Ride, type When } from "@/my-rides/rides";
import { useRides } from "@/my-rides/use-rides";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * My rides, a place of the menu (spec 16, 3.3): my bookings and the trips I
 * drive in one list, coming up or past. Coming up puts what needs me first.
 * Which list shows lives in the address, so Back returns to it. Signed
 * out, it asks to sign in.
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
  const { loaded, reload } = useRides(when);

  return (
    <Screen>
      <Title>{t("nav.myRides")}</Title>
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
        <>
          <Notice
            message={
              loaded.failure.error.code === "network_error"
                ? errorText(t, loaded.failure)
                : t("myRides.failed")
            }
          />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : when === "upcoming" ? (
        <ComingUp rides={loaded.rides} />
      ) : loaded.rides.length === 0 ? (
        <Body>{t("myRides.nonePast")}</Body>
      ) : (
        <Rides rides={loaded.rides} at={now()} />
      )}
    </Screen>
  );
}

/**
 * What needs me under "Needs you", then the rest, soonest first (3.3 items
 * 2 and 3), or Find a ride and Offer a ride when nothing is coming up.
 */
function ComingUp({ rides }: { readonly rides: readonly Ride[] }) {
  const { t } = useLanguage();
  const me = useMe();
  const at = now();
  if (rides.length === 0) {
    return (
      <View style={styles.nothing}>
        <Body>{t("myRides.nothing")}</Body>
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
  }
  const needing = rides.filter((ride) => needsYou(ride, at) !== null);
  const rest = rides.filter((ride) => needsYou(ride, at) === null);
  if (needing.length === 0) return <Rides rides={rest} at={at} />;
  return (
    <>
      <Heading>{t("myRides.needsYou")}</Heading>
      <Rides rides={needing} at={at} />
      {rest.length === 0 ? null : (
        <>
          <Heading>{t("myRides.comingUp")}</Heading>
          <Rides rides={rest} at={at} />
        </>
      )}
    </>
  );
}

function Rides({ rides, at }: { readonly rides: readonly Ride[]; readonly at: Date }) {
  return rides.map((ride) => <RideItem key={rideKey(ride)} ride={ride} at={at} />);
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  nothing: { gap: spacing.sm },
});
