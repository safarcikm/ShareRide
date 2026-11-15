import { driverReadinessRoute, listVehiclesRoute, type Vehicle } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { ReadinessList } from "@/driving/readiness-list";
import { carSummary } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const addCar = () => {
  router.push("/drive/cars/new");
};

/**
 * Offer, a place of the menu (spec 16, 3.1). Signed out, it asks to sign in,
 * keeping the offer so Offer opens after signing up.
 */
export default function OfferScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) {
    return (
      <SignInFirst
        title={t("driver.offerRide")}
        body={t("nav.offerSignedOut")}
        signInLabel={t("nav.offerSignIn")}
        onSignIn={() => {
          offerRide(null);
        }}
      />
    );
  }
  return <ReadyToDrive />;
}

/**
 * Ready to drive (spec 3, screen 1): what is still needed before the first
 * trip, each with a way to do it, and the driver's cars. Loads again when the
 * driver comes back from adding a car or confirming the licence.
 */
function ReadyToDrive() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(
    () =>
      Promise.all([session.call(driverReadinessRoute, {}), session.call(listVehiclesRoute, {})]),
    [session],
  );
  const { value, reload } = useLoadedOnFocus(load);

  let content: ReactNode;
  if (value === undefined) {
    content = (
      <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
    );
  } else {
    const [readiness, vehicles] = value;
    if (!readiness.ok || !vehicles.ok) {
      const failure = readiness.ok ? vehicles : readiness;
      content = (
        <>
          <Notice message={failure.ok ? null : errorText(t, failure)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      );
    } else {
      content = (
        <>
          {readiness.data.ready ? (
            <Notice kind="info" message={t("driver.ready.allSet")} />
          ) : (
            <Body>{t("driver.ready.intro")}</Body>
          )}
          <ReadinessList readiness={readiness.data} />
          <Button
            label={t("trip.post")}
            onPress={() => {
              router.push("/drive/trips/new");
            }}
          />
          <Button
            variant="secondary"
            label={t("trip.myTrips")}
            onPress={() => {
              router.push("/drive/trips");
            }}
          />
          <Cars cars={vehicles.data.vehicles} />
        </>
      );
    }
  }

  return (
    <Screen>
      <Title>{t("driver.ready.title")}</Title>
      {content}
    </Screen>
  );
}

/** The driver's cars, each opening to edit it, and a way to add another. */
function Cars({ cars }: { readonly cars: readonly Vehicle[] }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  if (cars.length === 0) return null;
  return (
    <View style={styles.cars}>
      <Heading>{t("driver.cars")}</Heading>
      {cars.map((car) => {
        const summary = carSummary(t, locale, car);
        const plate = car.registration ?? t("vehicle.noPlate");
        return (
          <Card
            key={car.id}
            accessibilityLabel={`${summary}, ${plate}`}
            onPress={() => {
              router.push({ pathname: "/drive/cars/[id]", params: { id: car.id } });
            }}
          >
            <Text style={[typography.heading, { color: palette.text }]}>{summary}</Text>
            <Text style={[typography.small, { color: palette.textMuted }]}>{plate}</Text>
          </Card>
        );
      })}
      <Button variant="secondary" label={t("vehicle.add")} onPress={addCar} />
    </View>
  );
}

const styles = StyleSheet.create({ cars: { gap: spacing.md } });
