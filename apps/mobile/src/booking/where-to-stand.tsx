import type { Booking } from "@shareride/contracts";
import { useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Body, Heading } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { IcelandMap } from "@/maps/iceland-map";
import { mapsUrl } from "@/meeting-points/maps-url";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** Whether `WhereToStand` shows anything for the booking: a seat that is confirmed. */
export function showsWhereToStand(booking: Booking): boolean {
  return booking.confirmed !== null && booking.status === "confirmed";
}

/**
 * Where to stand at the stop where a confirmed passenger gets in (spec 5,
 * screen 6; spec 31, 3.8, item 5): the place on a small map of its part of
 * Iceland, its name and what the meeting point says about where to stand,
 * with "Open in maps" at the heading's right, which goes under the heading
 * where the two have no room. Nothing before the seat is confirmed, or
 * once the ride completed. With `fill`, beside another card, it is as tall
 * as its row.
 */
export function WhereToStand({
  booking,
  fill = false,
}: {
  readonly booking: Booking;
  readonly fill?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [mapsFailed, setMapsFailed] = useState(false);
  const { board, confirmed } = booking;
  if (confirmed === null || !showsWhereToStand(booking)) return null;
  const name = board.meetingPoint.name[locale];
  return (
    <Card fill={fill}>
      <View testID="where-to-stand" style={styles.stand}>
        <View style={styles.head}>
          <View style={styles.heading}>
            <Heading>{t("meetingPoints.whereToStand")}</Heading>
          </View>
          <TextLink
            align="start"
            label={t("meetingPoints.openInMaps")}
            onPress={() => {
              setMapsFailed(false);
              Linking.openURL(mapsUrl(board.meetingPoint.position, name, Platform.OS)).catch(() => {
                setMapsFailed(true);
              });
            }}
          />
        </View>
        <View style={styles.place}>
          <View style={styles.map}>
            <IcelandMap
              fit
              label={t("meetingPoints.pointMap", { name })}
              dots={[
                {
                  id: board.meetingPoint.id,
                  position: board.meetingPoint.position,
                  look: "chosen",
                },
              ]}
            />
          </View>
          <View style={styles.words}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>{name}</Text>
            {confirmed.whereToStand === null ? null : (
              <Body align="start">{confirmed.whereToStand[locale]}</Body>
            )}
          </View>
        </View>
        <Notice message={mapsFailed ? t("meetingPoints.mapsFailed") : null} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stand: { gap: spacing.sm },
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: spacing.ms,
  },
  heading: { flexShrink: 1 },
  place: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: spacing.ms },
  map: { width: sizes.mapBeside },
  words: { flexGrow: 1, flexShrink: 1, flexBasis: sizes.wordsBeside, gap: spacing.xs },
});
