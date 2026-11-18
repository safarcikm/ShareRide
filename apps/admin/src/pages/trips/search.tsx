import { adminTripsRoute, type AdminTripListItem } from "@shareride/contracts";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { personName, tripStatusKeys, tripsPath } from "../reports/texts.ts";
import { isId, plannedText, routeText } from "./texts.ts";

interface Filters {
  readonly date?: string;
  readonly place?: string;
  readonly id?: string;
  /** From a person's page: the trips they drive. */
  readonly driverId?: string;
}

/** A person's page links here with `?driverId=`; nothing else is read from the address. */
function filtersFromAddress(): Filters {
  const driverId = new URLSearchParams(window.location.search).get("driverId");
  return driverId !== null && isId(driverId) ? { driverId: driverId.toLowerCase() } : {};
}

type List =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | {
      readonly state: "ready";
      readonly trips: readonly AdminTripListItem[];
      /** More trips matched than the list shows. */
      readonly more: boolean;
    };

/**
 * Find trips by the day they leave, a stop, or a trip's or booking's ID
 * (spec 9, 3.5.1); with nothing filled in, the trips from today on. A
 * person's page opens it with their trips as a driver.
 */
export function TripSearch() {
  const { t, call, navigate } = useConsole();
  const [filters, setFilters] = useState<Filters>(filtersFromAddress);
  const [draft, setDraft] = useState({ date: "", place: "", id: "" });
  const [idWrong, setIdWrong] = useState(false);
  const [list, setList] = useState<List>({ state: "loading" });
  const idField = useRef<HTMLInputElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  // A refused ID takes the focus once its problem is on the page.
  const [idChecks, setIdChecks] = useState(0);
  // Only the newest request may show its answer.
  const request = useRef(0);
  const ids = {
    form: useId(),
    date: useId(),
    place: useId(),
    placeHint: useId(),
    id: useId(),
    idError: useId(),
    list: useId(),
  };

  const load = useCallback(async () => {
    const mine = ++request.current;
    setList({ state: "loading" });
    const result = await call(adminTripsRoute, { query: filters });
    if (mine !== request.current) return;
    setList(
      result.ok
        ? { state: "ready", trips: result.data.trips, more: result.data.more }
        : { state: "failed" },
    );
  }, [call, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (idChecks > 0) idField.current?.focus();
  }, [idChecks]);

  function apply() {
    const id = draft.id.trim();
    if (id !== "" && !isId(id)) {
      setIdWrong(true);
      setIdChecks((count) => count + 1);
      return;
    }
    const place = draft.place.trim();
    setFilters({
      ...(filters.driverId === undefined ? {} : { driverId: filters.driverId }),
      ...(draft.date === "" ? {} : { date: draft.date }),
      ...(place === "" ? {} : { place }),
      ...(id === "" ? {} : { id: id.toLowerCase() }),
    });
  }

  const filtered = Object.keys(filters).length > 0;

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.trips.title")}</h1>
      <p className="type-body muted">{t("admin.trips.intro")}</p>
      <form
        className="stack panel"
        role="search"
        aria-labelledby={ids.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <h2 id={ids.form} className="type-heading">
          {t("admin.trips.find")}
        </h2>
        <div className="filter-fields">
          <div className="field">
            <label htmlFor={ids.date} className="type-label">
              {t("admin.trips.date")}
            </label>
            <input
              id={ids.date}
              className="input type-body"
              type="date"
              value={draft.date}
              onChange={(event) => {
                setDraft({ ...draft, date: event.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.place} className="type-label">
              {t("admin.trips.place")}
            </label>
            <input
              id={ids.place}
              className="input type-body"
              autoComplete="off"
              aria-describedby={ids.placeHint}
              value={draft.place}
              onChange={(event) => {
                setDraft({ ...draft, place: event.target.value });
              }}
            />
            <p id={ids.placeHint} className="hint type-small">
              {t("admin.trips.placeHint")}
            </p>
          </div>
          <div className="field">
            <label htmlFor={ids.id} className="type-label">
              {t("admin.trips.id")}
            </label>
            <input
              id={ids.id}
              ref={idField}
              className="input type-body"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={idWrong}
              aria-describedby={idWrong ? ids.idError : undefined}
              value={draft.id}
              onChange={(event) => {
                setDraft({ ...draft, id: event.target.value });
                setIdWrong(false);
              }}
            />
            {idWrong ? (
              <p id={ids.idError} className="field-error type-small">
                {t("admin.trips.idInvalid")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="button-primary type-button">
            {t("admin.trips.search")}
          </button>
          {filtered ? (
            <button
              type="button"
              className="button-quiet type-label"
              onClick={() => {
                setDraft({ date: "", place: "", id: "" });
                setIdWrong(false);
                if (filters.driverId !== undefined) {
                  // Out of the address too: the page opens afresh.
                  navigate(tripsPath);
                  document.getElementById("page")?.focus();
                  return;
                }
                setFilters({});
                // The button goes with the filters: the list takes the focus.
                listHeading.current?.focus();
              }}
            >
              {t("admin.trips.clear")}
            </button>
          ) : null}
        </div>
      </form>
      <h2 id={ids.list} ref={listHeading} className="type-heading" tabIndex={-1}>
        {t(filtered ? "admin.trips.found" : "admin.trips.upcoming")}
      </h2>
      {filters.driverId === undefined ? null : (
        <p className="type-body muted">{t("admin.trips.oneDriver")}</p>
      )}
      {/* One live region for the page, so each new count is read out. */}
      <div role="status">
        {list.state === "loading" ? (
          <p className="type-body">{t("common.loading")}</p>
        ) : list.state === "ready" ? (
          <>
            <p className="type-body">
              {list.trips.length === 0
                ? t("admin.trips.none")
                : t(filtered ? "admin.trips.count" : "admin.trips.countUpcoming", {
                    count: list.trips.length,
                  })}
            </p>
            {list.more ? (
              <p className="type-body">{t("admin.trips.more", { count: list.trips.length })}</p>
            ) : null}
          </>
        ) : null}
      </div>
      {list.state === "loading" ? null : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.trips.loadFailed")}
          </p>
          <button type="button" className="button-secondary type-label" onClick={() => void load()}>
            {t("admin.retry")}
          </button>
        </div>
      ) : list.trips.length === 0 ? null : (
        <TripCards trips={list.trips} labelledBy={ids.list} />
      )}
    </section>
  );
}

/** Trips as cards, each linking to its page; on a person's page too. */
export function TripCards({
  trips,
  labelledBy,
}: {
  readonly trips: readonly AdminTripListItem[];
  readonly labelledBy?: string;
}) {
  const { t, locale } = useConsole();
  return (
    <ul className="cards" aria-labelledby={labelledBy}>
      {trips.map((trip) => (
        <li key={trip.id} className="card entry">
          <ConsoleLink to={`${tripsPath}/${trip.id}`} className="type-label">
            {routeText(t, locale, trip)}
          </ConsoleLink>
          <p className="type-body">
            {t("admin.trips.line", {
              driver: personName(t, trip.driver),
              when: plannedText(t, locale, trip.departsAt),
              status: t(tripStatusKeys[trip.status]),
            })}
          </p>
          <p className="type-small muted">
            {t("admin.trips.seats", { held: trip.seatsHeld, capacity: trip.capacity })}
          </p>
        </li>
      ))}
    </ul>
  );
}
