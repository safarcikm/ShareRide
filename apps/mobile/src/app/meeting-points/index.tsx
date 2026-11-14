import { meetingPointsRoute, type MeetingPointSummary } from "@shareride/contracts";
import { regions } from "@shareride/domain";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { openSearchResult } from "@/meeting-points/open-result";
import { PlaceSearch } from "@/meeting-points/place-search";
import { MeetingPointCard } from "@/meeting-points/result-cards";
import { regionKeys } from "@/meeting-points/texts";
import { spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Meeting points (spec 2, screen 1) as a list by region, with place search.
 * Open to everyone. The map comes with milestone 3's last PR.
 */
export default function MeetingPointsScreen() {
  const { t } = useLanguage();
  return (
    <Screen>
      <BackButton />
      <Title>{t("meetingPoints.title")}</Title>
      <Body>{t("meetingPoints.intro")}</Body>
      <PlaceSearch onChoose={openSearchResult} whenIdle={<Catalogue />} />
    </Screen>
  );
}

/** Every point shown, grouped by region in the order of `regions`, sorted by name. */
function Catalogue() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(meetingPointsRoute, {}), [session]);
  const { value: result, reload } = useLoaded(load);

  if (result === undefined) {
    return <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />;
  }
  if (!result.ok) {
    return (
      <>
        <Notice message={errorText(t, result)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </>
    );
  }
  const points = result.data.meetingPoints;
  if (points.length === 0) return <Body>{t("meetingPoints.empty")}</Body>;

  const byName = new Intl.Collator(locale);
  const sorted = [...points].sort((a, b) => byName.compare(a.name[locale], b.name[locale]));
  const groups = regions
    .map((region) => ({ region, points: sorted.filter((point) => point.region === region) }))
    .filter((group) => group.points.length > 0);
  return (
    <>
      {points.some((point) => point.sample) ? (
        <Notice kind="info" message={t("meetingPoints.sampleNotice")} />
      ) : null}
      {groups.map((group) => (
        <View key={group.region} style={styles.group}>
          <Heading>{t(regionKeys[group.region])}</Heading>
          {group.points.map((point) => (
            <PointInList key={point.id} point={point} />
          ))}
        </View>
      ))}
    </>
  );
}

function PointInList({ point }: { readonly point: MeetingPointSummary }) {
  return (
    <MeetingPointCard
      point={point}
      onPress={() => {
        openSearchResult({ kind: "meetingPoint", meetingPoint: point });
      }}
    />
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.md } });
