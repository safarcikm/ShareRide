import type { DriverReadiness } from "@shareride/contracts";
import { router } from "expo-router";
import { Card } from "@/components/card";
import { TickRow } from "@/components/tick-list";
import { useLanguage } from "@/i18n/language";
import { dayInIceland } from "./texts";

/**
 * What a driver needs before publishing (spec 3, screen 1): photo, car and
 * licence, each ticked when done, with a way to do what is not.
 */
export function ReadinessList({ readiness }: { readonly readiness: DriverReadiness }) {
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
                action={{
                  label: t("vehicle.add"),
                  onPress: () => {
                    router.push("/drive/cars/new");
                  },
                }}
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
