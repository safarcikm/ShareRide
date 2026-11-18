import { ArrowUpDown } from "lucide-react-native";
import { useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { useHover } from "@/theme/hover";
import {
  controlOutline,
  maxContentWidth,
  minTouchTarget,
  radii,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Card } from "./card";
import { IconButton } from "./icon-button";
import { SearchField } from "./search-field";

export type RouteEnd = "from" | "to";

type EndRef = ComponentRef<typeof View>;

/**
 * From and To in one card, each pressed to choose again, with a button that
 * swaps them: for posting a trip (spec 3) and for searching (spec 4). The
 * end being chosen shows `search`, a place search that drops down in its
 * place; the swap button waits until it closes. With `direction="row"`, as
 * in the search row of a wide Find (spec 18, 3.5), the two sit side by side
 * with the swap button between them, each a caption over its value in a
 * `SearchField`, and the card is the row's own.
 */
export function RouteEnds({
  from,
  to,
  labels,
  open = null,
  search = null,
  direction = "column",
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
  readonly direction?: "column" | "row";
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
      stacked={direction === "row"}
      search={open === which ? search : null}
      onPress={() => {
        onPick(which);
      }}
    />
  );
  const swap = (
    <IconButton
      icon={ArrowUpDown}
      label={labels.swap}
      disabled={from === null && to === null}
      onPress={onSwap}
    />
  );
  if (direction === "row") {
    return (
      <View style={styles.rowEnds}>
        <View style={styles.rowEnd}>{end("from")}</View>
        {/* Its room stays while a place is chosen, so To does not move. */}
        <View style={styles.rowSwap}>{open === null ? swap : null}</View>
        <View style={styles.rowEnd}>{end("to")}</View>
      </View>
    );
  }
  return (
    <Card>
      <View style={styles.ends}>
        <View style={styles.endFields}>
          {end("from")}
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          {end("to")}
        </View>
        {open === null ? swap : null}
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
  stacked,
  search,
  onPress,
}: {
  readonly endRef: RefObject<EndRef | null>;
  readonly label: string;
  readonly value: string | null;
  readonly placeholder: string;
  /** The end of the route has a filled dot, the start an empty one. */
  readonly filled: boolean;
  /** In a row of fields: the dot and caption on one line, the value under them. */
  readonly stacked: boolean;
  /** Shown in place of the value while this end is being chosen. */
  readonly search: ReactNode;
  readonly onPress: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [hovered, hover] = useHover();
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
      <View style={stacked ? styles.stackedSearching : styles.searching}>
        <View style={styles.searchingLabel}>
          {dot}
          {caption}
        </View>
        {search}
      </View>
    );
  }
  const text = (
    <Text
      style={[
        value === null ? typography.body : typography.bodyStrong,
        { color: value === null ? palette.textMuted : palette.text },
        stacked && styles.stackedText,
      ]}
    >
      {shown}
    </Text>
  );
  const pressable = {
    ref: endRef,
    accessibilityRole: "button",
    accessibilityLabel: t("trip.route.field", { field: label, value: shown }),
    onPress,
  } as const;
  if (stacked) {
    return (
      <Pressable {...pressable} {...hover} style={styles.stackedEnd}>
        <View style={styles.searchingLabel}>
          {dot}
          {caption}
        </View>
        <SearchField hovered={hovered}>{text}</SearchField>
      </Pressable>
    );
  }
  return (
    <Pressable {...pressable} style={styles.end}>
      {dot}
      <View style={styles.endTexts}>
        {caption}
        {text}
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
  // In a row: each end at least half a column wide, growing with the row.
  // The swap button stands close between the two fields it swaps.
  rowEnds: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: maxContentWidth + sizes.iconButton + 2 * spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  rowEnd: { flexGrow: 1, flexShrink: 1, flexBasis: maxContentWidth / 2, minWidth: 0 },
  // Beside the values, under the captions.
  rowSwap: {
    width: sizes.iconButton,
    marginTop:
      typography.caption.lineHeight + spacing.xs + (sizes.buttonHeight - sizes.iconButton) / 2,
  },
  stackedEnd: { gap: spacing.xs },
  // A long name goes to a second line inside its field.
  stackedText: { flexShrink: 1 },
  // The caption stays where it is when the place search takes the value's place.
  stackedSearching: { gap: spacing.xs },
});
