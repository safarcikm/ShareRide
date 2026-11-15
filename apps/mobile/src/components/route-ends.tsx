import { ArrowUpDown } from "lucide-react-native";
import { useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { controlOutline, minTouchTarget, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Card } from "./card";
import { IconButton } from "./icon-button";

export type RouteEnd = "from" | "to";

type EndRef = ComponentRef<typeof View>;

/**
 * From and To in one card, each pressed to choose again, with a button that
 * swaps them: for posting a trip (spec 3) and for searching (spec 4). The
 * end being chosen shows `search`, a place search that drops down in its
 * place; the swap button waits until it closes.
 */
export function RouteEnds({
  from,
  to,
  labels,
  open = null,
  search = null,
  onPick,
  onSwap,
}: {
  /** The chosen names, or null for not chosen yet. */
  readonly from: string | null;
  readonly to: string | null;
  readonly labels: {
    readonly from: string;
    readonly to: string;
    /** Shown while an end is not chosen. */
    readonly choose: string;
    readonly swap: string;
  };
  /** The end being chosen, if any. */
  readonly open?: RouteEnd | null;
  /** The place search shown in place of the open end. */
  readonly search?: ReactNode;
  readonly onPick: (end: RouteEnd) => void;
  readonly onSwap: () => void;
}) {
  const palette = usePalette();
  const refs = { from: useRef<EndRef>(null), to: useRef<EndRef>(null) };

  // Once the place search closes, focus goes back to the end it was for,
  // rather than to the top of the page on the web.
  const wasOpen = useRef(open);
  useEffect(() => {
    const closed = wasOpen.current;
    wasOpen.current = open;
    if (closed === null || open !== null) return;
    const end = refs[closed].current;
    if (end === null) return;
    if (Platform.OS === "web") (end as unknown as { focus: () => void }).focus();
    else AccessibilityInfo.sendAccessibilityEvent(end, "focus");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = (which: RouteEnd) => (
    <End
      endRef={refs[which]}
      label={labels[which]}
      value={which === "from" ? from : to}
      placeholder={labels.choose}
      filled={which === "to"}
      search={open === which ? search : null}
      onPress={() => {
        onPick(which);
      }}
    />
  );
  return (
    <Card>
      <View style={styles.ends}>
        <View style={styles.endFields}>
          {end("from")}
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          {end("to")}
        </View>
        {open === null ? (
          <IconButton
            icon={ArrowUpDown}
            label={labels.swap}
            disabled={from === null && to === null}
            onPress={onSwap}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** From or To: what is chosen, pressed to choose again; or the place search for it. */
function End({
  endRef,
  label,
  value,
  placeholder,
  filled,
  search,
  onPress,
}: {
  readonly endRef: RefObject<EndRef | null>;
  readonly label: string;
  readonly value: string | null;
  readonly placeholder: string;
  /** The end of the route has a filled dot, the start an empty one. */
  readonly filled: boolean;
  /** Shown in place of the value while this end is being chosen. */
  readonly search: ReactNode;
  readonly onPress: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const shown = value ?? placeholder;
  const dot = (
    <View
      style={[
        styles.dot,
        { borderColor: palette.primary },
        filled && { backgroundColor: palette.primary },
      ]}
    />
  );
  const caption = <Text style={[typography.caption, { color: palette.textMuted }]}>{label}</Text>;
  if (search !== null && search !== undefined) {
    return (
      <View style={styles.searching}>
        <View style={styles.searchingLabel}>
          {dot}
          {caption}
        </View>
        {search}
      </View>
    );
  }
  return (
    <Pressable
      ref={endRef}
      accessibilityRole="button"
      accessibilityLabel={t("trip.route.field", { field: label, value: shown })}
      onPress={onPress}
      style={styles.end}
    >
      {dot}
      <View style={styles.endTexts}>
        {caption}
        <Text
          style={[
            value === null ? typography.body : typography.bodyStrong,
            { color: value === null ? palette.textMuted : palette.text },
          ]}
        >
          {shown}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ends: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  endFields: { flex: 1 },
  end: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.ms,
    minHeight: minTouchTarget,
    paddingVertical: spacing.xs,
  },
  endTexts: { flex: 1 },
  searching: { gap: spacing.xs, paddingVertical: spacing.xs },
  searchingLabel: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  dot: {
    width: spacing.ms,
    height: spacing.ms,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
  },
  divider: { height: controlOutline, marginLeft: spacing.ms + spacing.ms },
});
