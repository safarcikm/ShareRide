import { ChevronDown, ChevronRight, ChevronUp, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { linkProps, type AppPath } from "@/navigation/link-props";
import { useHover } from "@/theme/hover";
import { ringInside } from "@/theme/ring-inside";
import { radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { useInActionRows } from "./action-rows";
import { Icon } from "./icon";
import { spaceKeyPresses } from "./space-key";
import { SwitchTrack } from "./switch";

interface RowLook {
  readonly title: string;
  /** The current value, such as "Confirmed" or "English", in muted text. */
  readonly value?: string | undefined;
  /** In a soft square before the title (spec 31, 3.3). */
  readonly icon?: LucideIcon | undefined;
  /** Cannot be undone: red, no chevron, and last in its card (R31.3). */
  readonly danger?: boolean;
}

/** What each kind of row takes; a row is one kind and takes nothing of another. */
interface Kinds {
  readonly onPress: () => void;
  readonly href: AppPath;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
  readonly switched: boolean;
  readonly onSwitch: (on: boolean) => void;
  readonly shows: true;
}

type Only<Own extends keyof Kinds> = Pick<Kinds, Own> & {
  readonly [Other in Exclude<keyof Kinds, Own>]?: never;
};

type RowKind =
  /** Does something: a button. */
  | Only<"onPress">
  /** Opens a screen: a link, an `<a href>` on the web. */
  | Only<"href">
  /** Unfolds what is under it. */
  | Only<"expanded" | "onToggle" | "children">
  /** Holds a switch, and is the switch. */
  | Only<"switched" | "onSwitch">
  /** Only shows a value: not a button. */
  | Only<"shows">;

/**
 * A `Row` (spec 15, section 5.2; spec 31, 3.3): an icon in a soft square
 * when it has one, the title in `bodyStrong`, a value such as "Confirmed"
 * in `small` `textMuted`, and a chevron; at least 56 high, tinted
 * `primarySoft` while pressed and under the pointer. Rows go in a `Card`,
 * or in `ActionRows` with a line between them.
 *
 * What it does shows at its end: a chevron to the right opens a screen (a
 * link with `href`, as a document on About is, spec 30, 3.1) or does
 * something; a chevron down unfolds its `children` under it; a switch turns
 * something on and off; a row that only `shows` a value has nothing there
 * and is not a button. A `danger` row is red and has no chevron.
 */
export function Row(props: RowLook & RowKind) {
  const { title, value, icon, danger = false } = props;
  const palette = usePalette();
  const inRows = useInActionRows();
  const [hovered, hover] = useHover();
  const ink = danger ? palette.error : palette.text;
  const face = (
    <>
      {icon === undefined ? null : (
        <View
          testID="row-icon"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.icon,
            { backgroundColor: danger ? palette.errorSoft : palette.background },
          ]}
        >
          <Icon icon={icon} color={ink} />
        </View>
      )}
      <Text style={[typography.bodyStrong, styles.title, { color: ink }]}>{title}</Text>
      {value === undefined ? null : (
        <Text style={[typography.small, styles.value, { color: palette.textMuted }]}>{value}</Text>
      )}
    </>
  );
  // In a card of rows each row is a surface of its own: the lines between
  // the rows are the card of rows showing through.
  const ground = inRows ? { backgroundColor: palette.surface } : null;
  const shape = [styles.row, inRows ? styles.inRows : styles.inCard, ground];
  if (props.shows === true) return <View style={shape}>{face}</View>;
  // Its focus ring is drawn inside it there, where the card would cut it off.
  const ring = inRows ? ringInside : null;

  const label = value === undefined ? title : `${title}, ${value}`;
  const tinted = ({ pressed }: { readonly pressed: boolean }) => [
    ...shape,
    pressed || hovered
      ? { backgroundColor: danger ? palette.errorSoft : palette.primarySoft }
      : null,
  ];
  if (props.switched !== undefined) {
    const { switched, onSwitch } = props;
    const toggle = () => {
      onSwitch(!switched);
    };
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        // aria-checked rather than accessibilityState, which the web build drops.
        aria-checked={switched}
        onPress={toggle}
        {...spaceKeyPresses(toggle)}
        {...hover}
        {...ring}
        style={tinted}
      >
        {face}
        <SwitchTrack value={switched} />
      </Pressable>
    );
  }
  if (props.expanded !== undefined) {
    return (
      <View style={ground}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          aria-expanded={props.expanded}
          onPress={props.onToggle}
          {...hover}
          {...ring}
          style={tinted}
        >
          {face}
          <Icon
            testID={props.expanded ? "row-chevron-up" : "row-chevron-down"}
            icon={props.expanded ? ChevronUp : ChevronDown}
            color={palette.textMuted}
          />
        </Pressable>
        {props.expanded ? (
          <View style={[styles.under, inRows && styles.underInRows]}>{props.children}</View>
        ) : null}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={props.href === undefined ? "button" : "link"}
      accessibilityLabel={label}
      {...(props.href === undefined ? { onPress: props.onPress } : linkProps(props.href))}
      {...hover}
      {...ring}
      style={tinted}
    >
      {face}
      {danger ? null : <Icon testID="row-chevron" icon={ChevronRight} color={palette.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: sizes.row, flexDirection: "row", alignItems: "center" },
  // In a card with padding, the tint reaches a little past the text.
  inCard: {
    gap: spacing.sm,
    borderRadius: radii.control,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  // In a card of rows, the row and its tint reach the card's edges.
  inRows: {
    gap: spacing.ms,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    marginHorizontal: 0,
    paddingVertical: spacing.sm,
  },
  icon: {
    width: sizes.rowIcon,
    height: sizes.rowIcon,
    borderRadius: radii.tag,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1 },
  value: { flexShrink: 1, textAlign: "right" },
  under: { paddingBottom: spacing.ms },
  underInRows: { paddingHorizontal: spacing.md },
});
