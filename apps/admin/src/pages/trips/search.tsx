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
 * (spec 9, 3.5.1); with nothing filled in, the trips from today on.
 */
export function TripSearch() {
  const { t, call } = useConsole();
  const [filters, setFilters] = useState<Filters>({});
  const [draft, setDraft] = useState({ date: "", place: "", id: "" });
  const [idWrong, setIdWrong] = useState(false);
  const [list, setList] = useState<List>({ state: "loading" });
  const idField = useRef<HTMLInputElement>(null);
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
    setList({ state: "loading" });
    const result = await call(adminTripsRoute, { query: filters });
    setList(
      result.ok
        ? { state: "ready", trips: result.data.trips, more: result.data.more }
        : { state: "failed" },
    );
  }, [call, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  function apply() {
    const id = draft.id.trim();
    if (id !== "" && !isId(id)) {
      setIdWrong(true);
      idField.current?.focus();
      return;
    }
    const place = draft.place.trim();
    setFilters({
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
                setFilters({});
              }}
            >
              {t("admin.trips.clear")}
            </button>
          ) : null}
        </div>
      </form>
      <h2 id={ids.list} className="type-heading">
        {t(filtered ? "admin.trips.found" : "admin.trips.upcoming")}
      </h2>
      {list.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.trips.loadFailed")}
          </p>
          <button type="button" className="button-secondary type-label" onClick={() => void load()}>
            {t("admin.retry")}
          </button>
        </div>
      ) : (
        <>
          <div role="status">
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
          </div>
          {list.trips.length === 0 ? null : <TripCards trips={list.trips} labelledBy={ids.list} />}
        </>
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
