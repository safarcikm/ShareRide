import {
  nearestMeetingPointsRoute,
  type MeetingPointSummary,
  type Place,
  type PlaceSearchResult,
} from "@shareride/contracts";
import { formatDistance } from "@shareride/i18n";
import { X } from "lucide-react-native";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { PlaceSearch } from "@/meeting-points/place-search";
import { MeetingPointCard } from "@/meeting-points/result-cards";
import { Loading } from "./use-draft";

/**
 * Choosing a meeting point for a trip (spec 3, 3.4.1): the place search of
 * spec 2. A meeting point is chosen at once; a town shows its nearest
 * points to choose from. Paused points cannot be chosen.
 */
export function PointPicker({
  title,
  onChoose,
  onCancel,
}: {
  readonly title: string;
  readonly onChoose: (point: MeetingPointSummary) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [place, setPlace] = useState<Place | null>(null);
  const [paused, setPaused] = useState(false);
  const choose = (point: MeetingPointSummary) => {
    if (point.status === "active") onChoose(point);
    else setPaused(true);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon={X} label={t("common.cancel")} onPress={onCancel} />
      </View>
      <Title>{title}</Title>
      <Notice message={paused ? t("trip.route.pointPaused") : null} />
      {place === null ? (
        <>
          <Body>{t("trip.route.pickHelp")}</Body>
          <PlaceSearch
            onChoose={(result: PlaceSearchResult) => {
              setPaused(false);
              if (result.kind === "meetingPoint") choose(result.meetingPoint);
              else setPlace(result.place);
            }}
          />
        </>
      ) : (
        <Nearby
          place={place}
          onChoose={choose}
          onBack={() => {
            setPlace(null);
          }}
        />
      )}
    </Screen>
  );
}

function Nearby({
  place,
  onChoose,
  onBack,
}: {
  readonly place: Place;
  readonly onChoose: (point: MeetingPointSummary) => void;
  readonly onBack: () => void;
}) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const load = useCallback(
    () => session.call(nearestMeetingPointsRoute, { params: { id: place.id } }),
    [place.id, session],
  );
  const { value: result, reload } = useLoaded(load);
  return (
    <>
      <Heading>{t("trip.route.nearby", { place: place.name[locale] })}</Heading>
      {result === undefined ? (
        <Loading />
      ) : !result.ok ? (
        <Loading failure={result} onRetry={reload} />
      ) : (
        result.data.meetingPoints.map(({ meetingPoint, distanceM }) => (
          <MeetingPointCard
            key={meetingPoint.id}
            point={meetingPoint}
            detail={t("search.distanceAway", { distance: formatDistance(distanceM, locale) })}
            onPress={() => {
              onChoose(meetingPoint);
            }}
          />
        ))
      )}
      <Button variant="text" label={t("trip.route.backToSearch")} onPress={onBack} />
    </>
  );
}

const styles = StyleSheet.create({ header: { flexDirection: "row" } });
