import { myTripsRoute } from "@shareride/contracts";
import { useCallback, useState } from "react";
import { useMe, useSession } from "@/auth/session";
import { PausedBanner } from "@/beta/config";
import { offerRide } from "@/drive/offer-ride";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { SignInFirst } from "@/navigation/sign-in-first";
import { SuspendedAccount, suspensionNow } from "@/safety/suspended-account";
import { DraftRows } from "@/trips/draft-rows";
import { RouteStep } from "@/trips/route-step";

/**
 * Offer, a place of the menu (spec 16, 3.1 and 3.6). Signed in, it is step 1
 * of posting a trip, "Where are you driving?", with the drafts to continue
 * on top (spec 31, 3.11, item 6); the car and licence are asked for at step
 * 5. Signed out, it asks to sign in, keeping the offer so Offer opens after
 * signing up.
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
  // Offering rides is closed to a suspended person (spec 9, 3.6.2).
  const suspension = suspensionNow(me);
  if (suspension !== null) return <SuspendedAccount suspension={suspension} />;
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
  // Without an answer the form still opens; only the drafts to continue are missing.
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
      top={
        <>
          <PausedBanner part="trips" />
          <DraftRows drafts={drafts} />
        </>
      }
    />
  );
}
