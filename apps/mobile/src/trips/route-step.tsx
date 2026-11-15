import type { CallFailure } from "@shareride/api-client";
import {
  createTripRoute,
  quoteRoute,
  stopsAlongRoute,
  updateTripRoute,
  type MeetingPointSummary,
  type MyTrip,
  type Quote,
} from "@shareride/contracts";
import { firstTripChoices } from "@shareride/domain";
import { formatDistance, formatDuration, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { ArrowUpDown } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { Switch } from "@/components/switch";
import { Tag } from "@/components/tag";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import { controlOutline, minTouchTarget, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { PointPicker } from "./point-picker";
import { StepScreen } from "./step-screen";
import { goOn, stepHref } from "./steps";
import { useQuote } from "./use-quote";

interface Stop {
  readonly point: MeetingPointSummary;
  /** Switched off, the trip passes without stopping. */
  readonly on: boolean;
}

type Picking = "from" | "to" | "add";

/** What to tell the driver about a failed call on this step. */
function failureText(t: Translate, failure: CallFailure): string {
  switch (failure.error.code) {
    case "distances_pending":
      return t("trip.distancesPending");
    case "stop_unavailable":
      return t("trip.route.pointPaused");
    default:
      return errorText(t, failure);
  }
}

/**
 * Step 1, the route (spec 3, 3.4): from and to through the place search,
 * the meeting points on the way added as stops that the driver can switch
 * off, and others the driver adds, each put where it adds the least
 * distance. Continue saves the draft: a new one, or `trip` when changing
 * one. The draft keeps only the stops switched on. A new draft's own route
 * screen then takes this one's place, so Back finds the route as saved.
 */
export function RouteStep({
  trip,
  fromReview = false,
}: {
  readonly trip?: MyTrip;
  readonly fromReview?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [from, setFrom] = useState(trip?.stops[0]?.meetingPoint ?? null);
  const [to, setTo] = useState(trip?.stops.at(-1)?.meetingPoint ?? null);
  const [between, setBetween] = useState<readonly Stop[]>(
    trip?.stops.slice(1, -1).map(({ meetingPoint }) => ({ point: meetingPoint, on: true })) ?? [],
  );
  const [picking, setPicking] = useState<Picking | null>(null);
  // The ends whose points on the way are being looked up, and how that went.
  const [alongFor, setAlongFor] = useState<{ from: string; to: string } | null>(null);
  const [alongFailure, setAlongFailure] = useState<CallFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Before the driver has chosen them, quotes use a first trip's seats and level.
  const seats = trip?.seats ?? firstTripChoices.seats;
  const priceLevel = trip?.priceLevel ?? firstTripChoices.priceLevel;
  const departsAt = trip?.departsAt ?? null;
  const date = departsAt === null ? undefined : isoDay(dayOf(new Date(departsAt)));

  useEffect(() => {
    if (alongFor === null) return;
    let current = true;
    void session
      .call(stopsAlongRoute, { query: { ...alongFor, ...(date === undefined ? {} : { date }) } })
      .then((result) => {
        if (!current) return;
        if (result.ok) {
          setBetween(result.data.meetingPoints.map((point) => ({ point, on: true })));
          setAlongFor(null);
        } else {
          setAlongFailure(result);
        }
      });
    return () => {
      current = false;
    };
  }, [alongFor, attempt, date, session]);

  const stops = [from, ...between.filter((stop) => stop.on).map((stop) => stop.point), to];
  const ready = from !== null && to !== null && from.id !== to.id && alongFor === null;
  const ids = stops.flatMap((point) => (point === null ? [] : [point.id]));
  // The ends as they are now, for answers that arrive after a change.
  const endsKey = `${from?.id ?? ""}>${to?.id ?? ""}`;
  const latestEnds = useRef(endsKey);
  useEffect(() => {
    latestEnds.current = endsKey;
  }, [endsKey]);
  const quoted = useQuote(ready ? { stops: ids, seats, priceLevel } : null);
  const quote = quoted.result?.ok === true ? quoted.result.data : null;

  const ends = (start: MeetingPointSummary | null, end: MeetingPointSummary | null) => {
    setFrom(start);
    setTo(end);
    setMessage(null);
    setBetween([]);
    setAlongFailure(null);
    if (start === null || end === null) {
      setAlongFor(null);
    } else if (start.id === end.id) {
      setAlongFor(null);
      setMessage(t("trip.route.sameEnds"));
    } else {
      setAlongFor({ from: start.id, to: end.id });
    }
  };

  const add = async (point: MeetingPointSummary) => {
    const known = between.find((stop) => stop.point.id === point.id);
    if (point.id === from?.id || point.id === to?.id || known?.on === true) {
      setMessage(t("trip.route.alreadyOn", { name: point.name[locale] }));
      return;
    }
    if (known !== undefined) {
      setBetween(between.map((stop) => (stop === known ? { ...stop, on: true } : stop)));
      return;
    }
    const asked = endsKey;
    const result = await session.call(quoteRoute, {
      body: { stops: ids, add: point.id, seats, priceLevel },
    });
    // The ends changed while the quote was on its way: it is for another route.
    if (latestEnds.current !== asked) return;
    if (!result.ok) {
      setMessage(failureText(t, result));
      return;
    }
    // The quote puts the point where it adds least; it goes right after the
    // stop before it there, so switched-off stops keep their places. Stops
    // switched meanwhile keep how they were switched.
    const placed = result.data.stops;
    const before = placed[placed.indexOf(point.id) - 1];
    setBetween((current) => {
      if (current.some((stop) => stop.point.id === point.id)) return current;
      const next = [...current];
      next.splice(current.findIndex((stop) => stop.point.id === before) + 1, 0, {
        point,
        on: true,
      });
      return next;
    });
  };

  const save = async () => {
    setMessage(null);
    if (from === null || to === null) {
      setMessage(t("trip.route.chooseBoth"));
      return;
    }
    if (from.id === to.id) {
      setMessage(t("trip.route.sameEnds"));
      return;
    }
    if (!ready || quote === null) return;
    if (quote.problems.some((problem) => problem.code === "route_too_long")) {
      setMessage(t("trip.route.tooLong"));
      return;
    }
    setBusy(true);
    const result =
      trip === undefined
        ? await session.call(createTripRoute, { body: { stops: ids } })
        : await session.call(updateTripRoute, { params: { id: trip.id }, body: { stops: ids } });
    setBusy(false);
    if (!result.ok) {
      setMessage(failureText(t, result));
      return;
    }
    if (trip === undefined) {
      router.replace(stepHref(result.data.id, "route"));
      router.push(stepHref(result.data.id, "time"));
    } else {
      goOn(result.data.id, "time", fromReview);
    }
  };

  if (picking !== null) {
    const titles = {
      from: t("trip.route.pickFrom"),
      to: t("trip.route.pickTo"),
      add: t("trip.route.addPoint"),
    } as const;
    return (
      <PointPicker
        title={titles[picking]}
        onCancel={() => {
          setPicking(null);
        }}
        onChoose={(point) => {
          setPicking(null);
          if (picking === "from") ends(point, to);
          else if (picking === "to") ends(from, point);
          else void add(point);
        }}
      />
    );
  }

  const addedBy = (point: MeetingPointSummary) => {
    const index = ids.indexOf(point.id);
    const warning = quote?.warnings.find(
      (found) => found.code === "stop_adds_distance" && found.stop === index,
    );
    return warning?.code === "stop_adds_distance" ? warning.addedM : null;
  };

  return (
    <StepScreen
      step="route"
      title={t("trip.route.title")}
      footer={
        <Button
          main
          label={fromReview ? t("trip.saveChanges") : t("trip.route.next")}
          busy={busy || (ready && quoted.stale)}
          onPress={() => {
            void save();
          }}
        />
      }
    >
      <Card>
        <View style={styles.ends}>
          <View style={styles.endFields}>
            <End
              label={t("trip.from")}
              point={from}
              filled={false}
              onPress={() => {
                setPicking("from");
              }}
            />
            <View style={[styles.divider, { backgroundColor: palette.border }]} />
            <End
              label={t("trip.to")}
              point={to}
              filled
              onPress={() => {
                setPicking("to");
              }}
            />
          </View>
          <IconButton
            icon={ArrowUpDown}
            label={t("trip.route.swap")}
            disabled={from === null && to === null}
            onPress={() => {
              setFrom(to);
              setTo(from);
              setBetween([...between].reverse());
              // A lookup on its way, or one that failed, is for the new direction now.
              if (alongFor !== null) {
                setAlongFailure(null);
                setAlongFor({ from: alongFor.to, to: alongFor.from });
              }
            }}
          />
        </View>
      </Card>
      <Notice message={message} />
      {from === null || to === null || from.id === to.id ? null : (
        <>
          <Heading>{t("trip.route.stopsTitle")}</Heading>
          {alongFailure !== null ? (
            <>
              <Notice message={failureText(t, alongFailure)} />
              <Button
                variant="secondary"
                label={t("common.retry")}
                onPress={() => {
                  setAlongFailure(null);
                  setAttempt((count) => count + 1);
                }}
              />
            </>
          ) : alongFor !== null ? null : (
            <>
              <Body align="start">
                {between.length === 0 ? t("trip.route.noStops") : t("trip.stopsAdded")}
              </Body>
              {between.length === 0 ? null : (
                <Card>
                  {between.map((stop) => {
                    const added = addedBy(stop.point);
                    const name = stop.point.name[locale];
                    const adds =
                      added === null
                        ? null
                        : t("trip.stopAdds", { distance: formatDistance(added, locale) });
                    return (
                      <Switch
                        key={stop.point.id}
                        label={name}
                        spokenLabel={adds === null ? name : `${name}, ${adds}`}
                        value={stop.on}
                        onChange={(on) => {
                          setBetween(
                            between.map((known) => (known === stop ? { ...stop, on } : known)),
                          );
                        }}
                        below={adds === null ? undefined : <Tag kind="warning" label={adds} />}
                      />
                    );
                  })}
                </Card>
              )}
              <Button
                variant="secondary"
                label={t("trip.route.addPoint")}
                onPress={() => {
                  setMessage(null);
                  setPicking("add");
                }}
              />
            </>
          )}
          <QuoteSummary
            quote={quote}
            failure={quoted.result?.ok === false ? quoted.result : null}
            onRetry={quoted.retry}
          />
        </>
      )}
    </StepScreen>
  );
}

/** The route's length and typical time, or why there is none yet. */
function QuoteSummary({
  quote,
  failure,
  onRetry,
}: {
  readonly quote: Quote | null;
  readonly failure: CallFailure | null;
  readonly onRetry: () => void;
}) {
  const { locale, t } = useLanguage();
  if (failure !== null) {
    return (
      <>
        <Notice message={failureText(t, failure)} />
        <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
      </>
    );
  }
  if (quote === null) return null;
  const tooLong = quote.problems.some((problem) => problem.code === "route_too_long");
  return (
    <>
      <Body align="start">
        {t("trip.route.summary", {
          distance: formatDistance(quote.distanceM, locale),
          duration: formatDuration(quote.durationS, locale),
        })}
      </Body>
      {tooLong ? <Notice message={t("trip.route.tooLong")} /> : null}
    </>
  );
}

/** From or To: what is chosen, pressed to choose again. */
function End({
  label,
  point,
  filled,
  onPress,
}: {
  readonly label: string;
  readonly point: MeetingPointSummary | null;
  /** The end of the route has a filled dot, the start an empty one. */
  readonly filled: boolean;
  readonly onPress: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const value = point === null ? t("trip.route.choose") : point.name[locale];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("trip.route.field", { field: label, value })}
      onPress={onPress}
      style={styles.end}
    >
      <View
        style={[
          styles.dot,
          { borderColor: palette.primary },
          filled && { backgroundColor: palette.primary },
        ]}
      />
      <View style={styles.endTexts}>
        <Text style={[typography.caption, { color: palette.textMuted }]}>{label}</Text>
        <Text
          style={[
            point === null ? typography.body : typography.bodyStrong,
            { color: point === null ? palette.textMuted : palette.text },
          ]}
        >
          {value}
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
  dot: {
    width: spacing.ms,
    height: spacing.ms,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
  },
  divider: { height: controlOutline, marginLeft: spacing.ms + spacing.ms },
});
