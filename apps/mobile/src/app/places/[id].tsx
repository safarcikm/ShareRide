import { nearestMeetingPointsRoute, type NearestMeetingPoints } from "@shareride/contracts";
import { formatDistance } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";
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
import { MeetingPointCard } from "@/meeting-points/result-cards";
import { placeKindKeys, regionKeys } from "@/meeting-points/texts";
import { usePalette } from "@/theme/use-palette";

/**
 * A town, village, landmark or area chosen in place search, with the active
 * meeting points nearest to it and their distance in a straight line
 * (spec 2, 3.4.3). Open to everyone.
 */
export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(
    () => session.call(nearestMeetingPointsRoute, { params: { id } }),
    [id, session],
  );
  const { value: result, reload } = useLoaded(load);

  return (
    <Screen>
      <BackButton fallback="/meeting-points" />
      {result === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : result.ok ? (
        <Nearest nearest={result.data} />
      ) : result.status === 404 || result.status === 400 ? (
        <Notice message={t("places.notFound")} />
      ) : (
        <>
          <Notice message={errorText(t, result)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      )}
    </Screen>
  );
}

function Nearest({ nearest }: { readonly nearest: NearestMeetingPoints }) {
  const { locale, t } = useLanguage();
  const { place } = nearest;
  return (
    <>
      <Title>{place.name[locale]}</Title>
      <Body>
        {t("places.summary", {
          kind: t(placeKindKeys[place.kind]),
          region: t(regionKeys[place.region]),
        })}
      </Body>
      {nearest.withinReach ? null : <Notice kind="info" message={t("search.noneWithinReach")} />}
      <Heading>{t("search.nearest")}</Heading>
      {nearest.meetingPoints.map(({ meetingPoint, distanceM }) => (
        <MeetingPointCard
          key={meetingPoint.id}
          point={meetingPoint}
          detail={t("search.distanceAway", { distance: formatDistance(distanceM, locale) })}
          onPress={() => {
            openSearchResult({ kind: "meetingPoint", meetingPoint });
          }}
        />
      ))}
    </>
  );
}
