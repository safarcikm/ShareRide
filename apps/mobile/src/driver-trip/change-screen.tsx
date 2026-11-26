// The screens that change one part of a published trip other than its
// time (spec 6, 3.2): the price, the seats, the car, how people book, and
// the preferences and note. Each saves straight from its screen, which
// says before saving what the change means: nobody is told, or for the
// car, that passengers who booked are told.
import {
  changeTripRoute,
  myTripRoute,
  type MyTrip,
  type TripChangeBody,
} from "@shareride/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { ActionNotice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { isChangeable, NotChangeable, NotLoaded, refusalText, TripHead, tripHref } from "./changes";

/** A published trip that has not yet left: the one a part's screen changes. */
export type TripToChange = MyTrip & { readonly departsAt: string };

/** Edit trip, which each part's screen goes back to. */
export const editHref = (id: string) => ({
  pathname: "/drive/trips/[id]/edit" as const,
  params: { id },
});

/**
 * Loads the trip a part's screen changes: while it loads or why it did
 * not, that it can no longer change (R6.1), or the screen with the trip.
 */
export function WithTripToChange({
  title,
  children,
}: {
  readonly title: string;
  readonly children: (trip: TripToChange) => ReactNode;
}) {
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(myTripRoute, { params: { id } }), [session, id]);
  const { value: trip, reload } = useLoaded(load);
  if (trip === undefined || !trip.ok) {
    return <NotLoaded id={id} title={title} failure={trip} onRetry={reload} />;
  }
  if (!isChangeable(trip.data, now())) return <NotChangeable trip={trip.data} title={title} />;
  return children(trip.data);
}

/**
 * A part's screen: the trip and the title, what can change, and "Save the
 * change". Saving goes back to the trip, which says so with focus; a
 * change the server refuses says why here. Nothing is saved while the
 * part is as the trip has it, or while a field says what to fix.
 */
export function ChangePartScreen({
  trip,
  title,
  change,
  blocked = false,
  children,
}: {
  readonly trip: TripToChange;
  readonly title: string;
  /** The change as chosen; null while the part is as the trip has it. */
  readonly change: TripChangeBody | null;
  /** A field says what to fix before saving. */
  readonly blocked?: boolean;
  readonly children: ReactNode;
}) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setNotice(null);
    if (blocked) return;
    if (change === null) {
      setNotice(t("trip.editSame"));
      return;
    }
    setBusy(true);
    const answer = await session.call(changeTripRoute, {
      params: { id: trip.id },
      query: { preview: false },
      body: change,
    });
    setBusy(false);
    if (answer.ok) {
      // A new key each time, so each change takes focus on the trip.
      router.dismissTo(
        tripHref(trip.id, {
          changed: `${change.kind}-${String(Date.now())}`,
          told: String(answer.data.told),
        }),
      );
      return;
    }
    setNotice(refusalText(t, locale, trip, answer));
  };

  return (
    <Screen
      footer={
        <>
          <ActionNotice says={notice} />
          <Button
            main
            busy={busy}
            label={t("trip.editSave")}
            onPress={() => {
              void save();
            }}
          />
        </>
      }
    >
      <TripHead trip={trip} title={title} back={editHref(trip.id)} />
      {children}
    </Screen>
  );
}
