import {
  driverReadinessRoute,
  listVehiclesRoute,
  type DriverReadiness,
  type Vehicle,
} from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { TickRow } from "@/components/tick-list";
import { carSummary, dayInIceland } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const addCar = () => {
  router.push("/drive/cars/new");
};

/**
 * Ready to drive (spec 3, screen 1): what is still needed before the first
 * trip, each with a way to do it, and the driver's cars. Loads again when the
 * driver comes back from adding a car or confirming the licence.
 */
export default function DriveScreen() {
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
          <Checklist readiness={readiness.data} />
          <Cars cars={vehicles.data.vehicles} />
        </>
      );
    }
  }

  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("driver.ready.title")}</Title>
      {content}
    </Screen>
  );
}

function Checklist({ readiness }: { readonly readiness: DriverReadiness }) {
  const { locale, t } = useLanguage();
  return (
    <Card>
      {readiness.items.map(({ item, done }) => {
        switch (item) {
          case "photo":
            return (
              <TickRow
                key={item}
                testID="readiness-photo"
                label={t("driver.ready.photo")}
                done={done}
                detail={done ? undefined : t("driver.ready.photoLater")}
              />
            );
          case "car":
            return (
              <TickRow
                key={item}
                testID="readiness-car"
                label={t("driver.ready.car")}
                done={done}
                action={{ label: t("vehicle.add"), onPress: addCar }}
              />
            );
          case "licence":
            return (
              <TickRow
                key={item}
                testID="readiness-licence"
                label={t("driver.ready.licence")}
                done={done}
                detail={
                  readiness.licenceDeclaredAt === null
                    ? undefined
                    : t("driver.ready.licenceDone", {
                        date: dayInIceland(readiness.licenceDeclaredAt, locale),
                      })
                }
                action={{
                  label: t("driver.ready.confirmLicence"),
                  onPress: () => {
                    router.push("/drive/licence");
                  },
                }}
              />
            );
        }
      })}
    </Card>
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
