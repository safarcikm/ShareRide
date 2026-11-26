import type { TripDetails } from "@shareride/contracts";
import { formatClock, formatDuration } from "@shareride/i18n";
import { UserCheck, Zap } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/button";
import { RadioCard } from "@/components/radio-card";
import { RideTicket, TicketFoot } from "@/components/ride-ticket";
import { TakesFocus } from "@/components/takes-focus";
import { useLanguage } from "@/i18n/language";
import { escapeOnWeb } from "@/lib/escape-on-web";
import { spacing } from "@/theme/tokens";
import type { Part } from "./trip-link";

type Stop = TripDetails["stops"][number];
/** An end of the part: where the passenger gets in, or out. */
type End = "in" | "out";

const samePart = (one: Part, other: Part) =>
  one.board === other.board && one.alight === other.alight;

/**
 * The passenger's part of a ride as a ticket (spec 31, 3.7, item 2): how a
 * seat is booked beside "Your part of the ride", the two stops with their
 * times, and Change at the right of each. Change unfolds, in the ticket,
 * the stops that can take that end's place, as choices; one end at a time.
 * A choice, a second press or, on the web, Escape folds them again, and
 * focus goes back to the Change that opened them. A part changed from
 * elsewhere, such as the route's stops, folds them too and leaves focus
 * where it is. With no other stop to choose, an end has no Change. Under
 * the tear line stands the `foot`, such as the seats. A ride that was
 * `cancelled` says nothing of how a seat is booked.
 */
export function PartTicket({
  trip,
  part,
  onChange,
  foot,
  cancelled = false,
}: {
  readonly trip: Pick<TripDetails, "stops" | "bookingMode">;
  /** The part on screen, which can be ahead of the trip's answer. */
  readonly part: Part;
  readonly onChange: (part: Part) => void;
  /** Takes the whole line under the tear line; without it there is no tear line. */
  readonly foot?: ReactNode;
  readonly cancelled?: boolean;
}) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState<End | null>(null);
  // The end whose stops were last folded from inside the ticket, and how
  // many times that has happened: each gives focus back to that end's
  // Change, as what held it, the stop chosen, has gone.
  const [folded, setFolded] = useState<{ readonly end: End | null; readonly count: number }>({
    end: null,
    count: 0,
  });
  // The part last shown, and the one a choice here asked for. Any other
  // part came from elsewhere: nothing here is open any more, and no Change
  // that comes back with it takes focus.
  const [shown, setShown] = useState(part);
  const [asked, setAsked] = useState<Part | null>(null);
  if (!samePart(shown, part)) {
    setShown(part);
    setAsked(null);
    if (asked === null || !samePart(asked, part)) {
      setOpen(null);
      setFolded((was) => ({ end: null, count: was.count }));
    }
  }
  const board = trip.stops[part.board];
  const alight = trip.stops[part.alight];
  if (board === undefined || alight === undefined) return null;

  const name = (stop: Stop) => stop.meetingPoint.name[locale];
  const time = (stop: Stop) => formatClock(new Date(stop.plannedAt));
  const ends = {
    in: {
      stop: board,
      choices: trip.stops.filter((stop) => stop.position < part.alight),
      change: t("trip.changeGetIn"),
      group: t("trip.getInChoices"),
      partWith: (position: number): Part => ({ board: position, alight: part.alight }),
    },
    out: {
      stop: alight,
      choices: trip.stops.filter((stop) => stop.position > part.board),
      change: t("trip.changeGetOut"),
      group: t("trip.getOutChoices"),
      partWith: (position: number): Part => ({ board: part.board, alight: position }),
    },
  };
  const fold = (end: End) => {
    setOpen(null);
    setFolded((was) => ({ end, count: was.count + 1 }));
  };
  const change = (end: End) =>
    ends[end].choices.length > 1 ? (
      // The count is the key, so a Change that was there all along takes focus too.
      <TakesFocus key={folded.count} when={folded.end === end}>
        <Button
          variant="text"
          label={t("trip.change")}
          accessibilityLabel={ends[end].change}
          expanded={open === end}
          onPress={() => {
            setOpen((was) => (was === end ? null : end));
          }}
        />
      </TakesFocus>
    ) : undefined;
  const instant = trip.bookingMode === "instant";
  const unfolding = open === null ? null : { end: open, ...ends[open] };

  return (
    // Escape anywhere in the ticket folds what a Change opened.
    <View
      {...escapeOnWeb(() => {
        if (open !== null) fold(open);
      })}
    >
      <RideTicket
        testID="part-ticket"
        headed
        day={t("trip.yourPartOfRide")}
        // Moss where a seat is yours at once; blue where the driver answers first (spec 31, rule 6).
        tags={
          cancelled
            ? []
            : [
                instant
                  ? { label: t("results.instant"), kind: "positive", icon: Zap }
                  : { label: t("results.request"), kind: "info", icon: UserCheck },
              ]
        }
        from={{ time: time(board), place: name(board), action: change("in") }}
        to={{ time: time(alight), place: name(alight), action: change("out") }}
        between={formatDuration(
          (new Date(alight.plannedAt).getTime() - new Date(board.plannedAt).getTime()) / 1000,
          locale,
        )}
        unfolded={
          unfolding === null || unfolding.choices.length < 2 ? undefined : (
            // The stops stand under both ends, so focus goes to them from Change.
            <TakesFocus key={unfolding.end}>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={unfolding.group}
                style={styles.choices}
              >
                {unfolding.choices.map((each) => (
                  <RadioCard
                    key={each.position}
                    title={t("trip.timeAndStop", { time: time(each), name: name(each) })}
                    selected={each.position === unfolding.stop.position}
                    onSelect={() => {
                      fold(unfolding.end);
                      if (each.position !== unfolding.stop.position) {
                        const next = unfolding.partWith(each.position);
                        setAsked(next);
                        onChange(next);
                      }
                    }}
                  />
                ))}
              </View>
            </TakesFocus>
          )
        }
        foot={
          foot === undefined || foot === null ? undefined : (
            <TicketFoot start={<View style={styles.whole}>{foot}</View>} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { gap: spacing.sm },
  whole: { flex: 1 },
});
