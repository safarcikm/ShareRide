import type { MeetingPointSummary, Place } from "@shareride/contracts";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { Tag, type TagKind } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { minTouchTarget, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { placeKindKeys, regionKeys, typeKeys } from "./texts";

/**
 * A meeting point in a list: its name, type and municipality, an optional
 * detail such as its distance, and tags for paused and sample points. The
 * whole card opens it. `compact` shows it as a row of a dropdown list.
 */
export function MeetingPointCard({
  point,
  detail,
  compact = false,
  onPress,
}: {
  readonly point: MeetingPointSummary;
  readonly detail?: string;
  readonly compact?: boolean;
  readonly onPress: () => void;
}) {
  const { locale, t } = useLanguage();
  const name = point.name[locale];
  const type = t(typeKeys[point.type]);
  const tags: { kind: TagKind; label: string }[] = [];
  if (point.status === "paused") tags.push({ kind: "warning", label: t("meetingPoints.paused") });
  if (point.sample) tags.push({ kind: "info", label: t("meetingPoints.sample") });
  const Frame = compact ? Row : Card;
  return (
    <Frame
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
        compact={compact}
      />
      {tags.length === 0 ? null : (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <Tag key={tag.label} kind={tag.kind} label={tag.label} />
          ))}
        </View>
      )}
    </Frame>
  );
}

/** A town, village, landmark or area found by place search; `compact` as a row. */
export function PlaceCard({
  place,
  compact = false,
  onPress,
}: {
  readonly place: Place;
  readonly compact?: boolean;
  readonly onPress: () => void;
}) {
  const { locale, t } = useLanguage();
  const name = place.name[locale];
  const kind = t(placeKindKeys[place.kind]);
  const region = t(regionKeys[place.region]);
  const Frame = compact ? Row : Card;
  return (
    <Frame onPress={onPress} accessibilityLabel={[name, kind, region].join(", ")}>
      <Lines name={name} summary={t("places.summary", { kind, region })} compact={compact} />
    </Frame>
  );
}

/**
 * A row of a dropdown list, pressed to choose it: tinted while pressed,
 * and while the pointer is over it on the web.
 */
function Row({
  children,
  onPress,
  accessibilityLabel,
}: {
  readonly children: ReactNode;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        (pressed || hovered === true) && { backgroundColor: palette.primarySoft },
      ]}
    >
      {children}
    </Pressable>
  );
}

function Lines({
  name,
  nameTestID,
  detail,
  summary,
  compact,
}: {
  readonly name: string;
  readonly nameTestID?: string;
  readonly detail?: string | undefined;
  readonly summary: string;
  readonly compact: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={styles.lines}>
      <View style={styles.top}>
        <Text
          testID={nameTestID}
          style={[
            compact ? typography.bodyStrong : typography.heading,
            styles.name,
            { color: palette.text },
          ]}
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
  row: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.ms,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
  },
});
