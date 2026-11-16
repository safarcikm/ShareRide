import { myTripsRoute, type MyTrip } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Card } from "@/components/card";
import { TextLink } from "@/components/text-link";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { RouteStep } from "@/trips/route-step";
import { resumeStep, stepHref } from "@/trips/steps";
import { routeText } from "@/trips/texts";

/**
 * Offer, a place of the menu (spec 16, 3.1 and 3.6). Signed in, it is step 1
 * of posting a trip, "Where are you driving?", with the newest draft to
 * continue on top; the car and licence are asked for at step 5. Signed out,
 * it asks to sign in, keeping the offer so Offer opens after signing up.
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
  return <OfferForm />;
}

function OfferForm() {
  const session = useSession();
  // Each trip started here leaves an empty form behind for the next one.
  const [started, setStarted] = useState(0);
  const load = useCallback(
    () => session.call(myTripsRoute, { query: { when: "upcoming" } }),
    [session],
  );
  // Loads again on coming back, with the draft just started or left.
  const { value } = useLoadedOnFocus(load);
  // Without an answer the form still opens; only the draft to continue is missing.
  const drafts =
    value?.ok === true
      ? value.data.trips
          .filter((trip) => trip.status === "draft")
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      : [];
  return (
    <RouteStep
      key={started}
      onOffer
      onStarted={() => {
        setStarted((count) => count + 1);
      }}
      top={<ContinueDraft drafts={drafts} />}
    />
  );
}

/**
 * The draft changed last, which opens at the step where it was left, and
 * with more than one, a way to see them all (spec 16, 3.6, item 2).
 */
function ContinueDraft({ drafts }: { readonly drafts: readonly MyTrip[] }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [newest] = drafts;
  if (newest === undefined) return null;
  const label = t("trip.continueDraft", { route: routeText(t, locale, newest) });
  return (
    <View style={styles.drafts}>
      <Card
        accessibilityLabel={label}
        onPress={() => {
          router.push(stepHref(newest.id, resumeStep(newest)));
        }}
      >
        <Text style={[typography.bodyStrong, { color: palette.text }]}>{label}</Text>
      </Card>
      {drafts.length > 1 ? <TextLink label={t("trip.allDrafts")} href="/drive/trips" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ drafts: { gap: spacing.sm } });
