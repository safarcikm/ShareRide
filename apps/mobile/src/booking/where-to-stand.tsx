import type { Booking } from "@shareride/contracts";
import { useState } from "react";
import { Linking, Platform, Text } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { mapsUrl } from "@/meeting-points/maps-url";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Where to stand at the stop where a confirmed passenger gets in, with Open
 * in maps (spec 5, screen 6). Nothing before the seat is confirmed, or once
 * the ride completed.
 */
export function WhereToStand({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [mapsFailed, setMapsFailed] = useState(false);
  const { board, confirmed } = booking;
  if (confirmed === null || booking.status !== "confirmed") return null;
  const name = board.meetingPoint.name[locale];
  return (
    <Card>
      <Heading>{t("meetingPoints.whereToStand")}</Heading>
      <Text style={[typography.bodyStrong, { color: palette.text }]}>{name}</Text>
      {confirmed.whereToStand === null ? null : (
        <Body align="start">{confirmed.whereToStand[locale]}</Body>
      )}
      <Button
        variant="secondary"
        label={t("meetingPoints.openInMaps")}
        onPress={() => {
          setMapsFailed(false);
          Linking.openURL(mapsUrl(board.meetingPoint.position, name, Platform.OS)).catch(() => {
            setMapsFailed(true);
          });
        }}
      />
      <Notice message={mapsFailed ? t("meetingPoints.mapsFailed") : null} />
    </Card>
  );
}
