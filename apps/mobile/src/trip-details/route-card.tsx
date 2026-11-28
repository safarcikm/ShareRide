import type { Position } from "@shareride/ui/map";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/card";
import { useWideScreen } from "@/components/screen";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { RouteMap } from "@/maps/route-map";
import { spacing } from "@/theme/tokens";

/**
 * A ride on our map of Iceland (ADR 0024), in a card headed "The route"
 * (spec 31, 3.8 and 3.12): on a booked seat the whole ride with the
 * passenger's `part` solid, and on the ride I drive the whole way. On a
 * wide screen it stands in the main column, as a band, so it is not taller
 * than the window.
 */
export function RouteCard({
  label,
  stops,
  part,
}: {
  readonly label: string;
  readonly stops: readonly Position[];
  readonly part?: { readonly board: number; readonly alight: number };
}) {
  const { t } = useLanguage();
  const wide = useWideScreen();
  return (
    <Card>
      <View testID="route-card" style={styles.inCard}>
        <Heading>{t("ride.route")}</Heading>
        <RouteMap
          label={label}
          stops={stops}
          wide={wide}
          {...(part === undefined ? {} : { part })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // As a card's own gap, for what a card holds in one named part.
  inCard: { gap: spacing.ms },
});
