import {
  nearestMeetingPointsRoute,
  type MeetingPointSummary,
  type Place,
  type PlaceSearchResult,
} from "@shareride/contracts";
import { formatDistance } from "@shareride/i18n";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { PlaceDropdown } from "@/meeting-points/place-dropdown";
import { PlaceSearch } from "@/meeting-points/place-search";
import { MeetingPointCard } from "@/meeting-points/result-cards";
import { spacing } from "@/theme/tokens";
import { Loading } from "./use-draft";

/**
 * Choosing From or To for a trip (spec 3, 3.4.1): the place search of spec
 * 2, dropping down in place of the end being chosen. A meeting point is
 * chosen at once; a town lists its nearest points in the same list. Paused
 * points cannot be chosen.
 */
export function PointDropdown({
  label,
  onChoose,
  onClose,
}: {
  /** "From" or "To", as shown above the field. */
  readonly label: string;
  readonly onChoose: (point: MeetingPointSummary) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLanguage();
  const [place, setPlace] = useState<Place | null>(null);
  const [paused, setPaused] = useState(false);
  const choose = (point: MeetingPointSummary) => {
    if (point.status === "active") onChoose(point);
    else setPaused(true);
  };
  return (
    <PlaceDropdown
      label={label}
      placeholder={t("search.typePlace")}
      whenIdle={
        <View style={styles.idle}>
          <Body align="start">{t("trip.route.pickHelp")}</Body>
        </View>
      }
      message={paused ? t("trip.route.pointPaused") : null}
      instead={
        place === null ? undefined : (
          <Nearby
            place={place}
            compact
            onChoose={choose}
            onBack={() => {
              setPaused(false);
              setPlace(null);
            }}
          />
        )
      }
      onType={() => {
        setPaused(false);
        setPlace(null);
      }}
      onChoose={(result: PlaceSearchResult) => {
        setPaused(false);
        if (result.kind === "meetingPoint") choose(result.meetingPoint);
        else setPlace(result.place);
      }}
      onClose={onClose}
    />
  );
}

/**
 * Adding a meeting point to a trip's route (spec 3, 3.4.2), on a screen of
 * its own: the place search of spec 2. A meeting point is chosen at once; a
 * town shows its nearest points to choose from. Paused points cannot be
 * chosen. Its head is a step's (spec 31, 3.17): Back, which closes it, and
 * the title at the left, with the ride `over` it where one is changed.
 */
export function PointPicker({
  title,
  over,
  intro,
  onChoose,
  onCancel,
}: {
  readonly title: string;
  /** The ride the point is added to, in small text over the title. */
  readonly over?: string | undefined;
  /** What choosing a point does, under the title. */
  readonly intro?: string | undefined;
  readonly onChoose: (point: MeetingPointSummary) => void;
  /** Back: the picker closes with nothing chosen. */
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
      <ScreenHead title={title} over={over} line={intro} onBack={onCancel} />
      <Notice message={paused ? t("trip.route.pointPaused") : null} />
      {place === null ? (
        <>
          <Body align="start">{t("trip.route.pickHelp")}</Body>
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

/** The active and paused meeting points nearest a town; `compact` as rows of a dropdown. */
function Nearby({
  place,
  compact = false,
  onChoose,
  onBack,
}: {
  readonly place: Place;
  readonly compact?: boolean;
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
      <View style={compact && styles.idle}>
        <Heading>{t("trip.route.nearby", { place: place.name[locale] })}</Heading>
      </View>
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
            compact={compact}
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

const styles = StyleSheet.create({
  // In line with the text of the dropdown's rows.
  idle: { paddingHorizontal: spacing.ms, paddingVertical: spacing.xs },
});
