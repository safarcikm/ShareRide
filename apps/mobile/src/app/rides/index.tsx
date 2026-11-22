import { soonestTripsMaxLimit, soonestTripsRoute } from "@shareride/contracts";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";
import { useSession, useSessionState } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { failureText } from "@/search/failure-text";
import { ResultCard } from "@/search/result-card";
import { usePalette } from "@/theme/use-palette";

/**
 * All rides leaving soon (spec 4, 3.8, item 3): the 50 soonest, each for
 * its whole route, from "See all rides" on the front page. Pulling down
 * loads them again (spec 16, 3.9).
 */
export default function Rides() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const state = useSessionState();
  const load = useCallback(
    () => session.call(soonestTripsRoute, { query: { limit: soonestTripsMaxLimit } }),
    [session],
  );
  const { value: answer, reload, pull } = useLoaded(load);

  return (
    <Screen refresh={() => pull((loaded) => loaded.ok)}>
      <BackButton />
      <Title>{t("rides.title")}</Title>
      {answer === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : !answer.ok ? (
        <>
          <Notice message={failureText(t, answer)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : answer.data.results.length === 0 ? (
        <>
          <Body>{t("rides.none")}</Body>
          <Button
            variant="secondary"
            label={t("driver.offerRide")}
            onPress={() => {
              offerRide(state.status === "signedIn" ? state.me : null);
            }}
          />
        </>
      ) : (
        <>
          {answer.data.results.map((ride) => (
            <ResultCard
              key={ride.tripId}
              result={ride}
              searched={{ from: "", to: "" }}
              seats={1}
              showDay
            />
          ))}
          {answer.data.results.length === soonestTripsMaxLimit ? (
            <Body>{t("rides.limit")}</Body>
          ) : null}
        </>
      )}
    </Screen>
  );
}
