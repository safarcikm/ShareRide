import { adminTripRoute, type AdminTrip } from "@shareride/contracts";
import { carText, formatMoney } from "@shareride/i18n";
import { useCallback, useEffect, useId, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import {
  atText,
  bookingStatusKeys,
  personName,
  tripStatusKeys,
  tripsPath,
  usersPath,
} from "../reports/texts.ts";
import { bookingModeKeys, declineReasonKeys, plannedText, routeText } from "./texts.ts";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "missing" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly trip: AdminTrip };

/**
 * One trip (spec 9, 3.5.2): its driver, stops, car and note, and every
 * booking and request on it, with why the driver declined one (R5.7).
 */
export function TripDetail({ id }: { readonly id: string }) {
  const { t, locale, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const ids = { trip: useId(), stops: useId(), bookings: useId() };

  const load = useCallback(async () => {
    const result = await call(adminTripRoute, { params: { id } });
    if (result.ok) setLoaded({ state: "ready", trip: result.data });
    else setLoaded({ state: result.status === 404 ? "missing" : "failed" });
  }, [call, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded.state === "loading") {
    return (
      <p className="type-body" role="status">
        {t("common.loading")}
      </p>
    );
  }
  if (loaded.state !== "ready") {
    return (
      <section className="stack">
        <ConsoleLink to={tripsPath} className="type-label">
          {t("admin.trips.back")}
        </ConsoleLink>
        <p className="problem type-body" role="alert">
          {t(loaded.state === "missing" ? "admin.trips.notFound" : "admin.trips.loadOneFailed")}
        </p>
        {loaded.state === "failed" ? (
          <div className="actions">
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                setLoaded({ state: "loading" });
                void load();
              }}
            >
              {t("admin.retry")}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const { trip } = loaded;
  const driverName = personName(t, trip.driver);

  return (
    <section className="stack">
      <ConsoleLink to={tripsPath} className="type-label">
        {t("admin.trips.back")}
      </ConsoleLink>
      <h1 className="type-title">{routeText(t, locale, trip)}</h1>

      <section className="panel stack" aria-labelledby={ids.trip}>
        <h2 id={ids.trip} className="type-heading">
          {t("admin.trips.trip")}
        </h2>
        <dl className="facts type-body">
          <dt>{t("admin.trips.driver")}</dt>
          <dd>
            {trip.driver.status === "deleted" ? (
              driverName
            ) : (
              <ConsoleLink to={`${usersPath}/${trip.driver.userId}`}>{driverName}</ConsoleLink>
            )}
          </dd>
          <dt>{t("admin.trips.status")}</dt>
          <dd>
            {trip.cancelledAt === null
              ? t(tripStatusKeys[trip.status])
              : t(
                  trip.cancelledBy === "operator"
                    ? "admin.trips.cancelledByShareRide"
                    : "admin.trips.cancelledByDriver",
                  { when: atText(t, locale, trip.cancelledAt) },
                )}
          </dd>
          <dt>{t("admin.trips.departs")}</dt>
          <dd>{plannedText(t, locale, trip.departsAt)}</dd>
          <dt>{t("admin.trips.booking")}</dt>
          <dd>{t(bookingModeKeys[trip.bookingMode])}</dd>
          <dt>{t("admin.trips.seatsLabel")}</dt>
          <dd>{t("admin.trips.seats", { held: trip.seatsHeld, capacity: trip.capacity })}</dd>
          <dt>{t("admin.trips.car")}</dt>
          <dd>
            {trip.vehicle === null
              ? t("admin.trips.noCar")
              : `${carText(t, trip.vehicle)} · ${
                  trip.vehicle.registration ?? t("admin.trips.noPlate")
                }`}
          </dd>
          <dt>{t("admin.trips.note")}</dt>
          <dd>
            {trip.note === "" ? t("admin.trips.noNote") : trip.note}
            {trip.noteHidden ? (
              <>
                {" "}
                <span className="tag tag-warning type-small">{t("admin.reports.hiddenTag")}</span>
              </>
            ) : null}
          </dd>
        </dl>
      </section>

      <section className="panel stack" aria-labelledby={ids.stops}>
        <h2 id={ids.stops} className="type-heading">
          {t("admin.trips.stops")}
        </h2>
        <ol className="cards" aria-labelledby={ids.stops}>
          {trip.stops.map((stop, index) => (
            <li key={`${String(index)}-${stop.name.is}`} className="card entry">
              <p className="type-label">{stop.name[locale]}</p>
              <p className="tags">
                <span className="type-small muted">{plannedText(t, locale, stop.plannedAt)}</span>
                {stop.removed ? (
                  <span className="tag type-small">{t("admin.trips.removedTag")}</span>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel stack" aria-labelledby={ids.bookings}>
        <h2 id={ids.bookings} className="type-heading">
          {t("admin.trips.bookings")}
        </h2>
        {trip.bookings.length === 0 ? (
          <p className="type-body muted">{t("admin.trips.noBookings")}</p>
        ) : (
          <ul className="cards" aria-labelledby={ids.bookings}>
            {trip.bookings.map((booking) => {
              const name = personName(t, booking.passenger);
              return (
                <li key={booking.id} className="card entry">
                  <p className="type-label">
                    {booking.passenger.status === "deleted" ? (
                      name
                    ) : (
                      <ConsoleLink to={`${usersPath}/${booking.passenger.userId}`}>
                        {name}
                      </ConsoleLink>
                    )}
                  </p>
                  <p className="type-body">
                    {t("admin.trips.bookingLine", {
                      status: t(bookingStatusKeys[booking.status]),
                      seats: booking.seats,
                      route: routeText(t, locale, booking),
                      price: formatMoney(booking.totalPrice, locale),
                    })}
                  </p>
                  {booking.requestedAt === null ? null : (
                    <p className="type-small muted">
                      {t("admin.trips.requested", { when: atText(t, locale, booking.requestedAt) })}
                    </p>
                  )}
                  {booking.status === "declined" && booking.declineReason !== null ? (
                    <p className="type-small">
                      {t("admin.trips.declinedBecause", {
                        reason: t(declineReasonKeys[booking.declineReason]),
                      })}
                    </p>
                  ) : null}
                  <p className="type-small muted">
                    {t("admin.trips.bookingId", { id: booking.id })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
