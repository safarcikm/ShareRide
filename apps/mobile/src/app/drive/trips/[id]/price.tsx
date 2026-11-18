import { updateTripRoute, type MyTrip } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Body, Heading } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { PriceCard } from "@/trips/price-card";
import { StepScreen } from "@/trips/step-screen";
import { goOn } from "@/trips/steps";
import { priceSoFar, savedSoFar } from "@/trips/trip-so-far";
import { Loading, useDraftOnFocus } from "@/trips/use-draft";
import { useQuote } from "@/trips/use-quote";

/** Step 3, the price level (spec 3, 3.6; ADR 0012). */
export default function PriceStepScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { t } = useLanguage();
  const { value: result, reload } = useDraftOnFocus(id);
  if (result === undefined || !result.ok) {
    return (
      <StepScreen step="price" title={t("trip.price.title")}>
        <Loading failure={result} onRetry={reload} />
      </StepScreen>
    );
  }
  // A step left in the stack starts again from the draft when another step
  // changed it, so going back never saves an old copy over newer choices.
  return (
    <PriceStep key={result.data.updatedAt} trip={result.data} fromReview={from === "review"} />
  );
}

function PriceStep({ trip, fromReview }: { readonly trip: MyTrip; readonly fromReview: boolean }) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const [level, setLevel] = useState(trip.priceLevel);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const quoted = useQuote({
    stops: trip.stops.map((stop) => stop.meetingPoint.id),
    seats: trip.seats,
    priceLevel: level,
  });
  const quote = quoted.result?.ok === true ? quoted.result.data : null;

  const save = async () => {
    if (quote === null || quoted.stale) return;
    setFailure(null);
    setBusy(true);
    // The quote's level: the one chosen, or the highest if that was above it.
    const saved = await session.call(updateTripRoute, {
      params: { id: trip.id },
      body: { priceLevel: quote.priceLevel },
    });
    setBusy(false);
    if (!saved.ok) {
      setFailure(errorText(t, saved));
      return;
    }
    goOn(trip.id, "seats", fromReview);
  };

  return (
    <StepScreen
      step="price"
      title={t("trip.price.title")}
      soFar={{
        ...savedSoFar(t, locale, trip, "price", fromReview, quote),
        // The price as it is chosen here.
        price: priceSoFar(t, locale, quote, level),
      }}
      footer={
        <Button
          main
          label={fromReview ? t("trip.saveChanges") : t("trip.price.next")}
          busy={busy || quoted.stale}
          onPress={() => {
            void save();
          }}
        />
      }
    >
      {quoted.result === undefined ? (
        <Loading />
      ) : !quoted.result.ok ? (
        <Loading failure={quoted.result} onRetry={quoted.retry} />
      ) : null}
      {quote === null ? null : (
        <>
          <PriceCard
            names={trip.stops.map((stop) => stop.meetingPoint.name[locale])}
            prices={quote.segments.map((segment) => segment.price)}
            whole={quote.wholeRoutePrice}
            pricedLevel={quote.priceLevel}
            level={Math.min(level, quote.highestPriceLevel)}
            highest={quote.highestPriceLevel}
            step={quote.priceLevelStep}
            onLevel={setLevel}
          />
          <Notice message={failure} />
          <Heading>{t("trip.whyLimit")}</Heading>
          <Body align="start">{t("trip.price.whyBody")}</Body>
          <Body align="start">{t("trip.price.whyLimit.trip")}</Body>
          <TextLink label={t("trip.price.rules")} href="/legal/community-rules" />
        </>
      )}
    </StepScreen>
  );
}
