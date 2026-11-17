import type { CallResult } from "@shareride/api-client";
import { meetingPointsRoute, type MeetingPointSummary } from "@shareride/contracts";
import { regions } from "@shareride/domain";
import { regionKeys } from "@shareride/i18n";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Screen, useWideScreen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { IcelandMap } from "@/maps/iceland-map";
import { openSearchResult } from "@/meeting-points/open-result";
import { PlaceSearch } from "@/meeting-points/place-search";
import { MeetingPointCard } from "@/meeting-points/result-cards";
import { spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Meeting points (spec 2, screen 1) on our own map of Iceland (ADR 0024)
 * and as a list by region, with place search. Open to everyone. Wide
 * screens show the map beside the list; phones switch between them.
 */
export default function MeetingPointsScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const wide = useWideScreen();
  const load = useCallback(() => session.call(meetingPointsRoute, {}), [session]);
  const { value: result, reload } = useLoaded(load);
  const [shown, setShown] = useState<"map" | "list">("map");
  const points = result?.ok === true ? result.data.meetingPoints : [];
  return (
    <Screen aside={points.length === 0 ? undefined : <PointsMap points={points} />}>
      <BackButton />
      <Title>{t("meetingPoints.title")}</Title>
      <Body>{t("meetingPoints.intro")}</Body>
      <PlaceSearch
        onChoose={openSearchResult}
        whenIdle={
          <Catalogue
            result={result}
            reload={reload}
            shown={wide ? "list" : shown}
            onShow={wide ? undefined : setShown}
          />
        }
      />
    </Screen>
  );
}

/**
 * Every point shown on the map, or grouped by region in the order of
 * `regions` and sorted by name. With `onShow`, a choice switches between the
 * two.
 */
function Catalogue({
  result,
  reload,
  shown,
  onShow,
}: {
  /** Undefined while loading. */
  readonly result: CallResult<typeof meetingPointsRoute> | undefined;
  readonly reload: () => void;
  readonly shown: "map" | "list";
  readonly onShow: ((shown: "map" | "list") => void) | undefined;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();

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
      {onShow === undefined ? null : (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("meetingPoints.showAs")}
          style={styles.choice}
        >
          {(["map", "list"] as const).map((choice) => (
            <Chip
              key={choice}
              role="radio"
              label={t(choice === "map" ? "meetingPoints.map" : "meetingPoints.list")}
              selected={shown === choice}
              onToggle={() => {
                onShow(choice);
              }}
            />
          ))}
        </View>
      )}
      {shown === "map" ? (
        <PointsMap points={points} />
      ) : (
        groups.map((group) => (
          <View key={group.region} style={styles.group}>
            <Heading>{t(regionKeys[group.region])}</Heading>
            {group.points.map((point) => (
              <PointCard key={point.id} point={point} />
            ))}
          </View>
        ))
      )}
    </>
  );
}

/**
 * The points as dots on the whole of Iceland. A tap shows the points at that
 * spot, nearest first; a second tap on a lone point opens it.
 */
function PointsMap({ points }: { readonly points: readonly MeetingPointSummary[] }) {
  const { t } = useLanguage();
  const [near, setNear] = useState<readonly string[]>([]);
  const chosen = near.flatMap((id) => points.filter((point) => point.id === id));
  return (
    <View testID="points-map" style={styles.group}>
      <IcelandMap
        label={t("meetingPoints.mapLabel", { count: points.length })}
        dots={points.map((point) => ({
          id: point.id,
          position: point.position,
          look: near.includes(point.id) ? "chosen" : "plain",
        }))}
        onPressDots={(ids) => {
          const [only] = chosen;
          if (only !== undefined && chosen.length === 1 && ids.length === 1 && ids[0] === only.id) {
            openSearchResult({ kind: "meetingPoint", meetingPoint: only });
          } else {
            setNear(ids);
          }
        }}
      />
      {points.length === 0 ? null : chosen.length === 0 ? (
        <Body>{t("meetingPoints.mapHint")}</Body>
      ) : (
        chosen.map((point) => <PointCard key={point.id} point={point} />)
      )}
    </View>
  );
}

function PointCard({ point }: { readonly point: MeetingPointSummary }) {
  return (
    <MeetingPointCard
      point={point}
      onPress={() => {
        openSearchResult({ kind: "meetingPoint", meetingPoint: point });
      }}
    />
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  choice: { flexDirection: "row", gap: spacing.sm },
});
