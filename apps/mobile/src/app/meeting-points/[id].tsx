import { meetingPointRoute, type MeetingPointDetails } from "@shareride/contracts";
import { formatDate } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { mapsUrl } from "@/meeting-points/maps-url";
import { amenityKeys, regionKeys, seasonText, typeKeys } from "@/meeting-points/texts";
import { iconSizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** A meeting point's details (spec 2, screen 2). Open to everyone. */
export default function MeetingPointScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(
    () => session.call(meetingPointRoute, { params: { id } }),
    [id, session],
  );
  const { value: result, reload } = useLoaded(load);

  return (
    <Screen>
      <BackButton fallback="/meeting-points" />
      {result === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : result.ok ? (
        <Details point={result.data} />
      ) : result.status === 404 || result.status === 400 ? (
        <Notice message={t("meetingPoints.notFound")} />
      ) : (
        <>
          <Notice message={errorText(t, result)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      )}
    </Screen>
  );
}

function Details({ point }: { readonly point: MeetingPointDetails }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [mapsFailed, setMapsFailed] = useState(false);
  const name = point.name[locale];
  const otherName = point.name[locale === "is" ? "en" : "is"];
  const pausedText =
    point.pauseReason === null
      ? t("meetingPoints.paused")
      : t("meetingPoints.pausedBecause", { reason: point.pauseReason[locale] });
  return (
    <>
      <Title>{name}</Title>
      {otherName === name ? null : <Body>{otherName}</Body>}
      <Body>
        {t("meetingPoints.detailsLine", {
          type: t(typeKeys[point.type]),
          municipality: point.municipality,
          region: t(regionKeys[point.region]),
        })}
      </Body>
      {point.aliases.length === 0 ? null : (
        <Body>{t("meetingPoints.alsoKnownAs", { names: point.aliases.join(", ") })}</Body>
      )}
      {point.sample ? (
        <View style={styles.centre}>
          <Tag kind="info" label={t("meetingPoints.sample")} />
        </View>
      ) : null}
      {point.status === "paused" ? <Notice kind="info" message={pausedText} /> : null}
      {point.whereToStand === null ? null : (
        <Card>
          <Heading>{t("meetingPoints.whereToStand")}</Heading>
          <Text style={[typography.body, { color: palette.text }]}>
            {point.whereToStand[locale]}
          </Text>
        </Card>
      )}
      {point.amenities.length === 0 ? null : (
        <Card>
          <Heading>{t("meetingPoints.amenities")}</Heading>
          {point.amenities.map((amenity) => (
            <View key={amenity} style={styles.amenity}>
              <Icon icon={Check} color={palette.primary} size={iconSizes.inline} />
              <Text style={[typography.body, { color: palette.text }]}>
                {t(amenityKeys[amenity])}
              </Text>
            </View>
          ))}
        </Card>
      )}
      <Body>{seasonText(t, locale, point.season)}</Body>
      {point.lastCheckedOn === null ? null : (
        <Body>
          {t("meetingPoints.lastChecked", { date: formatDate(point.lastCheckedOn, locale) })}
        </Body>
      )}
      <Button
        variant="secondary"
        label={t("meetingPoints.openInMaps")}
        onPress={() => {
          setMapsFailed(false);
          Linking.openURL(mapsUrl(point.position, name, Platform.OS)).catch(() => {
            setMapsFailed(true);
          });
        }}
      />
      <Notice message={mapsFailed ? t("meetingPoints.mapsFailed") : null} />
    </>
  );
}

const styles = StyleSheet.create({
  // A row, so the tag (which keeps to its own width) sits in the middle.
  centre: { flexDirection: "row", justifyContent: "center" },
  amenity: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
