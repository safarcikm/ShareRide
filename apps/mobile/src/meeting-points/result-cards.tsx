import type { MeetingPointSummary, Place } from "@shareride/contracts";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { Tag, type TagKind } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { placeKindKeys, regionKeys, typeKeys } from "./texts";

/**
 * A meeting point in a list: its name, type and municipality, an optional
 * detail such as its distance, and tags for paused and sample points. The
 * whole card opens it.
 */
export function MeetingPointCard({
  point,
  detail,
  onPress,
}: {
  readonly point: MeetingPointSummary;
  readonly detail?: string;
  readonly onPress: () => void;
}) {
  const { locale, t } = useLanguage();
  const name = point.name[locale];
  const type = t(typeKeys[point.type]);
  const tags: { kind: TagKind; label: string }[] = [];
  if (point.status === "paused") tags.push({ kind: "warning", label: t("meetingPoints.paused") });
  if (point.sample) tags.push({ kind: "info", label: t("meetingPoints.sample") });
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[name, detail, type, point.municipality, ...tags.map((tag) => tag.label)]
        .filter((part) => part !== undefined)
        .join(", ")}
    >
      <Lines
        name={name}
        nameTestID="meeting-point-name"
        detail={detail}
        summary={t("meetingPoints.summary", { type, municipality: point.municipality })}
      />
      {tags.length === 0 ? null : (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <Tag key={tag.label} kind={tag.kind} label={tag.label} />
          ))}
        </View>
      )}
    </Card>
  );
}

/** A town, village, landmark or area found by place search. */
export function PlaceCard({
  place,
  onPress,
}: {
  readonly place: Place;
  readonly onPress: () => void;
}) {
  const { locale, t } = useLanguage();
  const name = place.name[locale];
  const kind = t(placeKindKeys[place.kind]);
  const region = t(regionKeys[place.region]);
  return (
    <Card onPress={onPress} accessibilityLabel={[name, kind, region].join(", ")}>
      <Lines name={name} summary={t("places.summary", { kind, region })} />
    </Card>
  );
}

function Lines({
  name,
  nameTestID,
  detail,
  summary,
}: {
  readonly name: string;
  readonly nameTestID?: string;
  readonly detail?: string | undefined;
  readonly summary: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.lines}>
      <View style={styles.top}>
        <Text
          testID={nameTestID}
          style={[typography.heading, styles.name, { color: palette.text }]}
        >
          {name}
        </Text>
        {detail === undefined ? null : (
          <Text style={[typography.label, { color: palette.text }]}>{detail}</Text>
        )}
      </View>
      <Text style={[typography.small, { color: palette.textMuted }]}>{summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lines: { gap: spacing.xs },
  top: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: spacing.sm,
  },
  name: { flexShrink: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
