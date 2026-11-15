import { updateTripRoute, type MyTrip, type Quote } from "@shareride/contracts";
import { suggestedPriceLevel } from "@shareride/domain";
import { formatMoney } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { PriceLevel } from "@/components/price-level";
import { Tag } from "@/components/tag";
import { Body, Heading } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { controlOutline, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { StepScreen } from "@/trips/step-screen";
import { goOn } from "@/trips/steps";
import { levelText } from "@/trips/texts";
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
  const { t } = useLanguage();
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
          <Prices quote={quote} trip={trip} level={level} onLevel={setLevel} />
          <Notice message={failure} />
          <Heading>{t("trip.whyLimit")}</Heading>
          <Body align="start">{t("trip.price.whyBody")}</Body>
          <TextLink label={t("trip.price.rules")} href="/legal/community-rules" />
        </>
      )}
    </StepScreen>
  );
}

/**
 * The whole-route price, the level control and each stretch's price. The
 * control shows the driver's own level at once, kept within the highest
 * the quote allows, so quick taps each count while prices are on their way.
 */
function Prices({
  quote,
  trip,
  level,
  onLevel,
}: {
  readonly quote: Quote;
  readonly trip: MyTrip;
  readonly level: number;
  readonly onLevel: (level: number) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const shown = Math.min(level, quote.highestPriceLevel);
  const whole = formatMoney(quote.wholeRoutePrice, locale);
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  return (
    <>
      <Card>
        <View style={styles.price}>
          <Text style={[typography.small, styles.centre, { color: palette.textMuted }]}>
            {t("trip.price.wholeRoute")}
          </Text>
          <Text
            testID="whole-route-price"
            style={[typography.display, styles.centre, { color: palette.text }]}
          >
            {whole}
          </Text>
          {quote.priceLevel === suggestedPriceLevel ? (
            <Tag kind="positive" label={t("trip.price.suggestedTag")} />
          ) : null}
        </View>
        <PriceLevel
          level={shown}
          highest={quote.highestPriceLevel}
          step={quote.priceLevelStep}
          suggested={suggestedPriceLevel}
          onChange={onLevel}
          valueText={t("trip.price.levelValue", {
            level: levelText(t, quote.priceLevel),
            price: whole,
          })}
        />
      </Card>
      <Card>
        <Heading>{t("trip.price.stretches")}</Heading>
        {quote.segments.map((segment, index) => {
          const from = names[index] ?? "";
          const to = names[index + 1] ?? "";
          const price = formatMoney(segment.price, locale);
          return (
            <View
              key={`${segment.from}-${segment.to}`}
              accessible
              accessibilityLabel={`${t("trip.stretchSpoken", { from, to })}, ${price}`}
              style={[
                styles.stretch,
                index > 0 && { borderTopWidth: controlOutline, borderTopColor: palette.border },
              ]}
            >
              <Text style={[typography.body, styles.stretchName, { color: palette.text }]}>
                {t("trip.stretch", { from, to })}
              </Text>
              <Text style={[typography.bodyStrong, { color: palette.text }]}>{price}</Text>
            </View>
          );
        })}
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t("trip.price.perStretch")}
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  price: { alignItems: "center", gap: spacing.sm },
  centre: { textAlign: "center" },
  stretch: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stretchName: { flex: 1 },
});
