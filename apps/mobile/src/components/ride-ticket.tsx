import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import type { AppPath } from "@/navigation/link-props";
import { controlOutline, edges, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Card, cardCornerRoom } from "./card";
import { Tag, type TagKind } from "./tag";

/** One end of a ride on its ticket. */
export interface TicketEnd {
  /** The time there, such as "18:30". */
  readonly time: string;
  readonly place: string;
  /** Under the place, such as "1.3 km from Kringlan". */
  readonly under?: ReactNode;
}

export interface TicketTag {
  readonly label: string;
  readonly kind: TagKind;
  readonly icon?: LucideIcon;
}

interface RideTicketProps {
  /** "Fri 27 Nov", or a caption such as "Your part of the ride". */
  readonly day: string;
  /** At the right of the day, such as "Book instantly" or "You drive". */
  readonly tags?: readonly TicketTag[];
  readonly from: TicketEnd;
  readonly to: TicketEnd;
  /** Beside the line: "1 h 35 min", "2 h 25 min, 5 stops", "1 seat, 800 ISK". */
  readonly between: string;
  /** At the right of the timetable: "1,500 ISK" over "per seat"; "Free" is an amount. */
  readonly price?: { readonly amount: string; readonly unit: string } | null;
  /** One line under the tear line, usually a `TicketFoot`; without it there is no tear line. */
  readonly foot?: ReactNode;
  /** A ride that is mine: a moss bottom edge. */
  readonly mine?: boolean;
  /** Makes the ticket one link, or one button, named by `accessibilityLabel`. */
  readonly href?: AppPath;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  /** In a grid: as tall as the tallest ticket of its row, with the foot at the bottom. */
  readonly fill?: boolean;
  /** A button of its own in the top right corner, such as Share (spec 28, 3.1). */
  readonly corner?: ReactNode;
  /** The ride is the one shown elsewhere, such as on a map. */
  readonly marked?: boolean;
  /** The pointer or the keyboard came to the ticket. */
  readonly onShow?: (() => void) | undefined;
}

/**
 * A ride, the same card wherever one shows (spec 31, 3.2, rule 1, and 3.3):
 * the day and its tags; the two times and places as a timetable, with what
 * lies between them beside the line; the price at the right. Under a tear
 * line the `foot` says what this place needs: the driver in the results,
 * your seat in My rides, the request to answer for a driver. Tickets in one
 * row of a grid are equally tall (`fill`).
 */
export function RideTicket({
  day,
  tags = [],
  from,
  to,
  between,
  price = null,
  foot,
  mine = false,
  href,
  onPress,
  accessibilityLabel,
  fill = false,
  corner,
  marked = false,
  onShow,
}: RideTicketProps) {
  const palette = usePalette();
  const times = [from.time, to.time] as const;
  const rail = { backgroundColor: palette.primary };
  return (
    <Card
      flush
      mine={mine}
      fill={fill}
      marked={marked}
      corner={corner}
      onHoverIn={onShow}
      onFocus={onShow}
      accessibilityLabel={accessibilityLabel}
      {...(href === undefined ? { onPress } : { href })}
    >
      <View testID="ticket-day" style={[styles.day, corner !== undefined && styles.dayWithCorner]}>
        <Text style={[typography.caption, styles.dayText, { color: palette.textMuted }]}>
          {day}
        </Text>
        {tags.map((tag) => (
          <Tag key={tag.label} label={tag.label} kind={tag.kind} icon={tag.icon} />
        ))}
      </View>
      <View testID="ticket-top" style={[styles.top, fill && styles.fill]}>
        <View testID="ticket-route" style={styles.route}>
          <View testID="ticket-from" style={styles.end}>
            <Time shown={from.time} times={times} />
            <Unspoken style={styles.railCell}>
              <View
                testID="ticket-ring"
                style={[
                  styles.dot,
                  styles.ring,
                  { borderColor: palette.primary, backgroundColor: palette.surface },
                ]}
              />
              <View testID="ticket-rail" style={[styles.rail, styles.fill, rail]} />
            </Unspoken>
            <Place testID="ticket-from-place" end={from} />
          </View>
          <View style={styles.end}>
            <Time shown={null} times={times} />
            <Unspoken style={styles.railCell}>
              <View testID="ticket-rail" style={[styles.rail, styles.fill, rail]} />
            </Unspoken>
            <Text style={[typography.small, styles.between, { color: palette.textMuted }]}>
              {between}
            </Text>
          </View>
          <View testID="ticket-to" style={styles.end}>
            <Time shown={to.time} times={times} />
            <Unspoken style={styles.railCell}>
              <View testID="ticket-rail" style={[styles.rail, styles.railEnd, rail]} />
              <View testID="ticket-dot" style={[styles.dot, rail]} />
            </Unspoken>
            <Place testID="ticket-to-place" end={to} />
          </View>
        </View>
        {price === null ? null : (
          <View testID="ticket-price" style={styles.price}>
            <Text style={[typography.figure, styles.priceText, { color: palette.text }]}>
              {price.amount}
            </Text>
            <Text style={[typography.small, styles.priceText, { color: palette.textMuted }]}>
              {price.unit}
            </Text>
          </View>
        )}
      </View>
      {foot === undefined || foot === null ? null : (
        <>
          <TearLine />
          {foot}
        </>
      )}
    </Card>
  );
}

/**
 * The usual foot of a ticket, one line: a picture and a name at the left,
 * and something at the right, such as the seats left or a status tag.
 */
export function TicketFoot({
  start,
  end,
}: {
  readonly start: ReactNode;
  readonly end?: ReactNode;
}) {
  return (
    <View testID="ticket-foot" style={styles.foot}>
      <View testID="ticket-foot-start" style={styles.footStart}>
        {start}
      </View>
      {end}
    </View>
  );
}

/** A drawing beside words that say the same: screen readers skip it. */
function Unspoken({
  children,
  style,
  testID,
}: {
  readonly children: ReactNode;
  readonly style?: object;
  readonly testID?: string;
}) {
  return (
    <View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      {children}
    </View>
  );
}

/**
 * A time in the timetable's first column. Each cell is as wide as the wider
 * of the two times, so the line beside them stands straight whatever the
 * digits are; the row between the ends shows none.
 */
function Time({
  shown,
  times,
}: {
  readonly shown: string | null;
  readonly times: readonly [string, string];
}) {
  const palette = usePalette();
  return (
    <View testID="ticket-time" style={styles.time}>
      {shown === null ? null : (
        <Text style={[typography.heading, styles.digits, { color: palette.text }]}>{shown}</Text>
      )}
      <Unspoken>
        {times.map((time, index) => (
          <Text key={index} style={[typography.heading, styles.digits, styles.width]}>
            {time}
          </Text>
        ))}
      </Unspoken>
    </View>
  );
}

function Place({ end, testID }: { readonly end: TicketEnd; readonly testID: string }) {
  const palette = usePalette();
  return (
    <View testID={testID} style={styles.place}>
      <Text style={[typography.bodyStrong, { color: palette.text }]}>{end.place}</Text>
      {end.under}
    </View>
  );
}

/**
 * A dashed line with a notch in each edge, in the page's colour, where a
 * ticket would be torn (spec 31, 3.3). Half of each notch is outside the
 * card, which cuts it off.
 */
function TearLine() {
  const palette = usePalette();
  const notch = { backgroundColor: palette.background };
  return (
    <Unspoken testID="ticket-tear" style={styles.tear}>
      <View testID="ticket-notch" style={[styles.notch, styles.notchStart, notch]} />
      <View style={styles.dashes}>
        <Svg width="100%" height={controlOutline}>
          <Line
            x1={0}
            y1={controlOutline / 2}
            x2="100%"
            y2={controlOutline / 2}
            stroke={palette.border}
            strokeWidth={controlOutline}
            strokeDasharray="6 4"
          />
        </Svg>
      </View>
      <View testID="ticket-notch" style={[styles.notch, styles.notchEnd, notch]} />
    </Unspoken>
  );
}

/** The line of the timetable and its ring: as thick as a card's edge. */
const line = edges.card;
/** A ring or a dot: as on From and To of a search (`RouteEnds`). */
const dot = spacing.ms;
/** How far a dot stands under the top of its place's first line, to be at its middle. */
const dotDrop = (typography.bodyStrong.lineHeight - dot) / 2;
/** The middle of a corner's button, from the card's top: the day and its tags stand there. */
const cornerMiddle = spacing.xs + sizes.iconButton / 2;

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  day: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.ms,
    paddingHorizontal: spacing.md,
    minHeight: spacing.ms + 2 * (cornerMiddle - spacing.ms),
  },
  dayWithCorner: { paddingRight: spacing.md + cardCornerRoom },
  dayText: { flex: 1 },
  top: {
    flexDirection: "row",
    gap: spacing.ms,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.ms,
  },
  route: { flex: 1, minWidth: 0 },
  // A place that wraps keeps its time, and its dot, on its first line.
  end: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  time: { flexShrink: 0 },
  digits: { fontVariant: ["tabular-nums"] },
  width: { height: 0, opacity: 0 },
  railCell: { alignSelf: "stretch", width: spacing.md, alignItems: "center" },
  dot: { width: dot, height: dot, borderRadius: radii.pill },
  ring: { borderWidth: line, marginTop: dotDrop },
  rail: { width: line },
  railEnd: { height: dotDrop },
  place: { flex: 1, minWidth: 0 },
  between: { flex: 1, paddingVertical: spacing.xs / 2 },
  price: { flexShrink: 0, alignItems: "flex-end" },
  priceText: { textAlign: "right" },
  tear: { height: controlOutline, justifyContent: "center" },
  dashes: { marginHorizontal: sizes.ticketNotch / 2 + spacing.xs },
  notch: {
    position: "absolute",
    top: (controlOutline - sizes.ticketNotch) / 2,
    width: sizes.ticketNotch,
    height: sizes.ticketNotch,
    borderRadius: radii.pill,
  },
  notchStart: { left: -sizes.ticketNotch / 2 },
  notchEnd: { right: -sizes.ticketNotch / 2 },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs / 2,
  },
  footStart: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
