import type { Me } from "@shareride/contracts";
import { Redirect, router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { nextRoute } from "@/auth/next-route";
import { useSessionState } from "@/auth/session";
import { bookingHref, takePendingBooking } from "@/booking/pending-booking";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Loading } from "@/components/loading";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { spacing } from "@/theme/tokens";

/**
 * Welcome (spec 1, screen 1). Signed-in people go on to the next step of
 * signing up, or to their profile. Apple and Google sign-in come in
 * milestone 2.
 */
export default function Welcome() {
  const { t } = useLanguage();
  const state = useSessionState();
  if (state.status === "signedIn") return <SignedIn me={state.me} />;
  return (
    <Screen>
      <View style={styles.top}>
        <LanguageSwitch />
      </View>
      <View style={styles.middle}>
        <Title>{t("welcome.title")}</Title>
        <Body>{t("welcome.tagline")}</Body>
      </View>
      <View style={styles.actions}>
        <Button
          label={t("welcome.continuePhone")}
          onPress={() => {
            router.push("/sign-in");
          }}
        />
        <Button
          variant="secondary"
          label={t("welcome.browseTrips")}
          onPress={() => {
            router.push("/search");
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
 * The next step of signing up; once it is done, the booking someone chose
 * before they had an account (spec 5, 3.1, item 1), or else their profile.
 */
function SignedIn({ me }: { readonly me: Me }) {
  const next = nextRoute(me);
  const [target, setTarget] = useState<Href | null>(null);
  // Once per visit: taking the choice forgets it.
  const taken = useRef(false);
  useEffect(() => {
    if (next !== "/profile" || taken.current) return;
    taken.current = true;
    void takePendingBooking(now()).then((pending) => {
      setTarget(pending === null ? "/profile" : bookingHref(pending));
    });
  }, [next]);
  if (next !== "/profile") return <Redirect href={next} />;
  return target === null ? <Loading /> : <Redirect href={target} />;
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "flex-end" },
  middle: { flex: 1, justifyContent: "center", gap: spacing.md },
  actions: { gap: spacing.sm },
});
