// What adding and removing a stop share on their check screens (spec 6,
// 3.2): lines of text, who is told, and why the change cannot be made.
import type { TripChangeEffect } from "@shareride/contracts";
import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { editHref, type TripToChange } from "./change-screen";
import { TripHeading } from "./changes";
import { limitUsedText } from "./limit";

export function Lines({ lines }: { readonly lines: readonly string[] }) {
  const palette = usePalette();
  return (
    <View style={styles.lines}>
      {lines.map((line) => (
        <Text key={line} style={[typography.body, { color: palette.text }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/**
 * Who is told of a stop added or removed, and that bookings keep their
 * stops and prices (rule P1). Requests are not told (spec 7, 3.3).
 */
export function ForPassengers({
  told,
  requests,
  stop,
}: Pick<TripChangeEffect, "told" | "requests"> & { readonly stop: "added" | "removed" }) {
  const { t } = useLanguage();
  const texts =
    stop === "added"
      ? ({ told: "trip.editToldStop", requests: "trip.editRequestsStop" } as const)
      : ({ told: "trip.editToldStopRemoved", requests: "trip.editRequestsStopRemoved" } as const);
  return (
    <Card>
      <Heading>{t("trip.editForPassengers")}</Heading>
      {told === 0 && requests === 0 ? (
        <Body align="start">{t("trip.editNobody")}</Body>
      ) : (
        <>
          {told === 0 ? null : <Body align="start">{t(texts.told, { count: told })}</Body>}
          {requests === 0 ? null : (
            <Body align="start">{t(texts.requests, { count: requests })}</Body>
          )}
          <Body align="start">{t("trip.editStopKeeps")}</Body>
        </>
      )}
    </Card>
  );
}

/**
 * When the stop leaves the trip less room under its limit, the check says
 * the level falls and every stretch's price with it (spec 17, section 7).
 */
export function LevelLowered({
  effect,
}: {
  readonly effect: Pick<TripChangeEffect, "priceLevel" | "priceLevelLowered">;
}) {
  const { t } = useLanguage();
  if (!effect.priceLevelLowered) return null;
  return (
    <>
      <Notice kind="info" message={limitUsedText(t, effect.priceLevel)} />
      <Body align="start">{t("trip.price.stopLowersAll")}</Body>
    </>
  );
}

/** Why the stop cannot be added or removed, with the way to choose another, or to try again. */
export function Refused({
  trip,
  title,
  other,
  onOther,
  onRetry,
  children,
}: {
  readonly trip: TripToChange;
  readonly title: string;
  /** The label of the way back to choosing. */
  readonly other: string;
  readonly onOther: () => void;
  readonly onRetry?: (() => void) | undefined;
  readonly children: string;
}) {
  const { t } = useLanguage();
  return (
    <Screen>
      <BackButton fallback={editHref(trip.id)} />
      <TripHeading trip={trip} title={title} />
      <TakesFocus key={children}>
        <Notice message={children} />
      </TakesFocus>
      {onRetry === undefined ? null : (
        <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
      )}
      <Button variant="secondary" label={other} onPress={onOther} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lines: { gap: spacing.xs },
});
