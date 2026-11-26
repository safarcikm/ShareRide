import { listVehiclesRoute, myTripRoute } from "@shareride/contracts";
import { routePrice } from "@shareride/domain";
import { capitalised, formatClock, formatDay, formatMoney } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import {
  Armchair,
  CarFront,
  Clock,
  Coins,
  Minus,
  Plus,
  Route,
  SlidersHorizontal,
  UserCheck,
  Zap,
} from "lucide-react-native";
import { useCallback } from "react";
import { useSession } from "@/auth/session";
import { ActionRows } from "@/components/action-rows";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { carSummary } from "@/driving/texts";
import {
  isChangeable,
  NotChangeable,
  NotLoaded,
  timeLines,
  TripHead,
  tripHref,
} from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { preferenceNeeds } from "@/trip-details/trip-parts";
import { bookingModeKeys, levelText } from "@/trips/texts";

/**
 * Edit trip (spec 6, 3.2; screen 3): what the published trip holds, one
 * part a row with what is set now (spec 31, 3.19), each opening its own
 * screen; before saving, that screen shows what the change means for
 * passengers. The time, the stops with the two rows that add and remove
 * one under them, the price, the seats, the car, how people book, and the
 * preferences and note. It loads again each time it comes into view.
 */
export default function EditTripScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    () =>
      Promise.all([
        session.call(myTripRoute, { params: { id } }),
        session.call(listVehiclesRoute, {}),
      ]),
    [session, id],
  );
  const { value, reload } = useLoadedOnFocus(load);
  const [trip, cars] = value ?? [];

  if (trip === undefined || !trip.ok || cars === undefined || !cars.ok) {
    const failure = trip?.ok === false ? trip : cars?.ok === false ? cars : undefined;
    return <NotLoaded id={id} title={t("trip.edit")} failure={failure} onRetry={reload} />;
  }
  if (!isChangeable(trip.data, now())) {
    return <NotChangeable trip={trip.data} title={t("trip.edit")} />;
  }
  const departure = new Date(trip.data.departsAt);
  const times = trip.data.stops.map((stop) => new Date(stop.plannedAt ?? departure));
  const { priceLevel, seats, vehicleId, bookingMode, preferences, note } = trip.data;
  const car = cars.data.vehicles.find((known) => known.id === vehicleId);
  const part = (
    name: "time" | "stop" | "remove-stop" | "price" | "seats" | "car" | "booking" | "details",
  ) => ({
    pathname: `/drive/trips/[id]/edit/${name}` as const,
    params: { id },
  });
  // As a passenger reads them on the ride, in one line: "Some chat, small bag, no pets".
  const likes = preferenceNeeds(t, preferences)
    .map(({ label }, index) =>
      index === 0 ? label : label.charAt(0).toLocaleLowerCase(locale) + label.slice(1),
    )
    .join(", ");
  const noted = note === "" ? t("trip.review.noNote") : note;
  return (
    <Screen>
      <TripHead
        trip={trip.data}
        title={t("trip.edit")}
        line={t("trip.editIntro")}
        back={tripHref(id)}
      />
      <ActionRows>
        <Row
          icon={Clock}
          title={t("trip.editTime")}
          value={capitalised(
            t("trip.mine.when", {
              day: formatDay(departure, locale),
              time: formatClock(departure),
            }),
            locale,
          )}
          href={part("time")}
        />
        {/* What is set, over the two rows that change it: each stop with its time. */}
        <Row
          shows
          stacked
          icon={Route}
          title={t("trip.editStops")}
          value={timeLines(t, locale, trip.data, times).slice(1).join("\n")}
        />
        <Row icon={Plus} title={t("trip.editAddStopAction")} href={part("stop")} />
        {/* Only a stop between the ends can go (R6.5). */}
        {trip.data.stops.length > 2 ? (
          <Row icon={Minus} title={t("trip.editRemoveStopAction")} href={part("remove-stop")} />
        ) : null}
        <Row
          icon={Coins}
          title={t("trip.review.price")}
          value={t("trip.review.priceLine", {
            level: levelText(t, priceLevel),
            price: formatMoney(routePrice(trip.data.segments.map(({ price }) => price)), locale),
          })}
          href={part("price")}
        />
        <Row
          icon={Armchair}
          title={t("trip.editSeats")}
          value={t("trip.seats.count", { count: seats })}
          href={part("seats")}
        />
        <Row
          icon={CarFront}
          title={t("trip.review.car")}
          value={car === undefined ? t("trip.review.noCar") : carSummary(t, locale, car)}
          href={part("car")}
        />
        <Row
          // The sign the ride's ticket has for how it is booked.
          icon={bookingMode === "instant" ? Zap : UserCheck}
          title={t("trip.bookingMode.title")}
          value={t(bookingModeKeys[bookingMode].title)}
          href={part("booking")}
        />
        <Row
          stacked
          icon={SlidersHorizontal}
          title={t("trip.editDetails")}
          value={`${likes}\n${noted}`}
          accessibilityLabel={`${t("trip.editDetails")}, ${likes}. ${noted}`}
          href={part("details")}
        />
      </ActionRows>
    </Screen>
  );
}
