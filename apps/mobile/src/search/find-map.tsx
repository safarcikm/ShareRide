import { meetingPointsRoute, type TripSearchResult } from "@shareride/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { IcelandMap, type MapDot } from "@/maps/iceland-map";
import { spacing } from "@/theme/tokens";

/**
 * Our map beside the rides leaving soon on a wide Find (spec 18, 3.5): the
 * whole of Iceland, so it stays still, with every meeting point as a muted
 * dot and the ride `shown` on it, its road drawn and its first and last
 * meeting point standing out. Without a ride, as while the rides load or
 * when none leave soon, the meeting points alone. "See the meeting points"
 * stands under it.
 *
 * It asks for the meeting points itself, so a phone, which has no map on
 * Find, never does. Until they come, and if they cannot be loaded, the map
 * shows the ride with its two ends, and says nothing of it: the cards have
 * all a ride needs, and the meeting points page says what went wrong. Find
 * stays open under the other screens, so a load that failed is tried again
 * each time the person comes back to it.
 */
export function FindMap({ shown }: { readonly shown: TripSearchResult | undefined }) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const load = useCallback(() => session.call(meetingPointsRoute, {}), [session]);
  const { value, refresh } = useLoaded(load);
  const points = value?.ok === true ? value.data.meetingPoints : [];

  // Read when Find comes back into view, not when the failure arrives:
  // that would ask again at once, and again, for as long as it failed.
  const retry = useRef<(() => void) | null>(null);
  useEffect(() => {
    retry.current = value?.ok === false ? refresh : null;
  });
  useFocusEffect(
    useCallback(() => {
      retry.current?.();
    }, []),
  );
  const ends = shown === undefined ? [] : [shown.board.meetingPoint, shown.alight.meetingPoint];

  const dots = new Map<string, MapDot>();
  for (const { id, position } of points) dots.set(id, { id, position, look: "muted" });
  for (const { id, position } of ends) dots.set(id, { id, position, look: "chosen" });

  const [from, to] = ends;
  const label =
    from === undefined || to === undefined
      ? points.length === 0
        ? t("results.map")
        : t("home.map", { count: points.length })
      : t("results.mapOf", {
          route: t("search.route", { from: from.name[locale], to: to.name[locale] }),
        });
  return (
    <View testID="find-map" style={styles.map}>
      <IcelandMap
        label={label}
        dots={[...dots.values()]}
        lines={
          ends.length === 0
            ? []
            : [{ id: "shown", positions: ends.map((end) => end.position), look: "part" }]
        }
      />
      {/* In a row, so the link starts at the left, its text under the map's edge. */}
      <View style={styles.link}>
        <Button
          variant="text"
          label={t("meetingPoints.open")}
          onPress={() => {
            router.push("/meeting-points");
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { gap: spacing.xs },
  // A text button has room around its label; the label lines up, not the room.
  link: { flexDirection: "row", marginLeft: -spacing.sm },
});
