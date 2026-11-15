import { soonestTripsRoute, type Me, type TripSearchResult } from "@shareride/contracts";
import { Redirect, router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { nextRoute } from "@/auth/next-route";
import { useSession, useSessionState } from "@/auth/session";
import { bookingHref, takePendingBooking } from "@/booking/pending-booking";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Loading } from "@/components/loading";
import { Screen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { offerRide } from "@/drive/offer-ride";
import { takePendingOffer } from "@/drive/pending-offer";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { ResultCard } from "@/search/result-card";
import { openSearch, useRouteSearch } from "@/search/route-search";
import { spacing } from "@/theme/tokens";

/** Rides on the front page; one more is asked for, to know whether there are others. */
const shownRides = 5;

/**
 * The front page (spec 1, screen 1; decision 6): a route search, the rides
 * leaving soon (spec 4, 3.8) and "Offer a ride", to show what is on offer
 * before signing up. Signed-in people go on to the next step of signing
 * up, or to their profile. Apple and Google sign-in come in milestone 2.
 */
export default function Welcome() {
  const state = useSessionState();
  if (state.status === "signedIn") return <SignedIn me={state.me} />;
  return <FrontPage />;
}

function FrontPage() {
  const { locale, t } = useLanguage();
  const session = useSession();
  // Loaded here, so choosing a place does not load them again.
  const load = useCallback(
    () => session.call(soonestTripsRoute, { query: { limit: shownRides + 1 } }),
    [session],
  );
  const { value } = useLoaded(load);
  const rides = value?.ok === true ? value.data.results : [];
  const route = useRouteSearch((query) => {
    void openSearch(query, locale);
  });
  if (route.picker !== null) return route.picker;
  return (
    <Screen>
      <View style={styles.top}>
        <Button
          variant="text"
          label={t("welcome.signIn")}
          onPress={() => {
            router.push("/sign-in");
          }}
        />
        <LanguageSwitch />
      </View>
      <View style={styles.intro}>
        <Title>{t("welcome.title")}</Title>
        <Body>{t("welcome.tagline")}</Body>
      </View>
      {route.fields}
      <Button
        variant="secondary"
        label={t("welcome.findRide")}
        onPress={() => {
          route.submit(1);
        }}
      />
      <LeavingSoon rides={rides} />
      <View style={styles.actions}>
        <Button
          label={t("driver.offerRide")}
          onPress={() => {
            offerRide(null);
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

/**
 * The next step of signing up; once it is done, the booking someone chose
 * before they had an account (spec 5, 3.1, item 1), Ready to drive when
 * they pressed "Offer a ride" (spec 1, 3.1, item 3), or else their profile.
 */
function SignedIn({ me }: { readonly me: Me }) {
  const next = nextRoute(me);
  const [target, setTarget] = useState<Href | null>(null);
  // Once per visit: taking the choice forgets it.
  const taken = useRef(false);
  useEffect(() => {
    if (next !== "/profile" || taken.current) return;
    taken.current = true;
    void takePendingBooking(now()).then(async (pending) => {
      if (pending !== null) {
        setTarget(bookingHref(pending));
        return;
      }
      setTarget((await takePendingOffer(now())) ? "/drive" : "/profile");
    });
  }, [next]);
  if (next !== "/profile") return <Redirect href={next} />;
  return target === null ? <Loading /> : <Redirect href={target} />;
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  intro: { gap: spacing.md, paddingVertical: spacing.lg },
  rides: { gap: spacing.md },
  actions: { gap: spacing.sm, paddingTop: spacing.lg },
});
