import {
  adminCorridorsRoute,
  adminCreateCorridorRoute,
  adminUpdateCorridorRoute,
  type AdminCorridor,
  type AdminCorridors,
} from "@shareride/contracts";
import { corridorMaxPlaces, corridorMinPlaces, corridorNameMaxLength } from "@shareride/domain";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly overview: AdminCorridors };

type Places = AdminCorridors["places"];

/**
 * Corridors (spec 10, 3.4.1 and screen 5): the roads the weekly figures
 * are counted for, each a name and its places in order. A corridor is
 * never deleted, so past weeks keep their figures; it can stop being
 * counted.
 */
export function CorridorsPage() {
  const { t, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await call(adminCorridorsRoute, {});
    setLoaded(result.ok ? { state: "ready", overview: result.data } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterSave = (corridor: AdminCorridor) => {
    setSaved(corridor.name);
    void load();
  };

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.corridors.title")}</h1>
      <p className="type-body muted">{t("admin.corridors.intro")}</p>
      {loaded.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : loaded.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.corridors.loadFailed")}
          </p>
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
      ) : (
        <>
          {saved === null ? null : (
            <p className="notice type-body" role="status">
              {t("admin.corridors.saved", { name: saved })}
            </p>
          )}
          <h2 className="type-heading">{t("admin.corridors.listTitle")}</h2>
          {loaded.overview.corridors.length === 0 ? (
            <p className="type-body muted">{t("admin.corridors.none")}</p>
          ) : (
            <ul className="cards">
              {loaded.overview.corridors.map((corridor) => (
                <CorridorCard
                  key={corridor.id}
                  corridor={corridor}
                  places={loaded.overview.places}
                  onSaved={afterSave}
                />
              ))}
            </ul>
          )}
          <CorridorForm
            // A new, empty form after each corridor added.
            key={loaded.overview.corridors.length}
            places={loaded.overview.places}
            onSaved={afterSave}
          />
        </>
      )}
    </section>
  );
}

/** The form for a new corridor, or for changing `corridor`. */
function CorridorForm({
  corridor,
  places,
  onSaved,
  onCancel,
}: {
  readonly corridor?: AdminCorridor;
  readonly places: Places;
  readonly onSaved: (corridor: AdminCorridor) => void;
  readonly onCancel?: () => void;
}) {
  const { t, call } = useConsole();
  const [name, setName] = useState(corridor?.name ?? "");
  // "" is a place not chosen yet.
  const [chosen, setChosen] = useState<readonly string[]>(
    () => corridor?.places.map((place) => place.id) ?? ["", ""],
  );
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const firstPlace = useRef<HTMLSelectElement>(null);
  const ids = {
    title: useId(),
    name: useId(),
    nameError: useId(),
    places: useId(),
    placesError: useId(),
    place: useId(),
  };

  const trimmed = name.trim();
  const nameProblem =
    trimmed === ""
      ? t("admin.corridors.nameMissing")
      : trimmed.length > corridorNameMaxLength
        ? t("admin.corridors.nameTooLong", { max: corridorNameMaxLength })
        : null;
  const picked = chosen.filter((id) => id !== "");
  const placesProblem =
    picked.length < corridorMinPlaces
      ? t("admin.corridors.placesTooFew", { min: corridorMinPlaces })
      : new Set(picked).size !== picked.length
        ? t("admin.corridors.placeTwice")
        : null;
  // A place that is gone still shows on a corridor that has it, until taken off.
  const known = new Set(places.map((place) => place.id));
  const gone = (corridor?.places ?? []).filter((place) => !known.has(place.id));

  const change = (index: number, id: string) => {
    setChosen(chosen.map((was, at) => (at === index ? id : was)));
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...chosen];
    const [taken] = next.splice(index, 1);
    next.splice(index + by, 0, taken ?? "");
    setChosen(next);
  };

  async function save() {
    setChecked(true);
    setFailed(false);
    if (nameProblem !== null) {
      nameInput.current?.focus();
      return;
    }
    if (placesProblem !== null) {
      firstPlace.current?.focus();
      return;
    }
    setSaving(true);
    const body = { name: trimmed, placeIds: picked };
    const result =
      corridor === undefined
        ? await call(adminCreateCorridorRoute, { body })
        : await call(adminUpdateCorridorRoute, { params: { id: corridor.id }, body });
    setSaving(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    onSaved(result.data);
  }

  const showPlacesProblem = checked && placesProblem !== null;
  return (
    <form
      className="card stack"
      noValidate
      aria-labelledby={ids.title}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 id={ids.title} className="type-heading">
        {corridor === undefined
          ? t("admin.corridors.newTitle")
          : t("admin.corridors.changeNamed", { name: corridor.name })}
      </h2>
      <div className="field">
        <label htmlFor={ids.name} className="type-label">
          {t("admin.corridors.name")}
        </label>
        <input
          ref={nameInput}
          id={ids.name}
          className="input type-body"
          value={name}
          aria-invalid={checked && nameProblem !== null}
          aria-describedby={checked && nameProblem !== null ? ids.nameError : undefined}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {checked && nameProblem !== null ? (
          <p id={ids.nameError} className="field-error type-small">
            {nameProblem}
          </p>
        ) : null}
      </div>
      <div
        className="stack"
        role="group"
        aria-labelledby={ids.places}
        aria-describedby={showPlacesProblem ? ids.placesError : undefined}
      >
        <p id={ids.places} className="type-label">
          {t("admin.corridors.places")}
        </p>
        {chosen.map((id, index) => {
          const number = index + 1;
          return (
            // The rows have no identity of their own: a place can be chosen twice by mistake.
            <div key={index} className="field">
              <label htmlFor={`${ids.place}-${String(index)}`} className="type-label">
                {t("admin.corridors.placeNumbered", { number })}
              </label>
              <select
                ref={index === 0 ? firstPlace : undefined}
                id={`${ids.place}-${String(index)}`}
                className="input type-body"
                value={id}
                aria-invalid={showPlacesProblem}
                onChange={(event) => {
                  change(index, event.target.value);
                }}
              >
                <option value="">{t("admin.corridors.choose")}</option>
                {gone
                  .filter((place) => place.id === id)
                  .map((place) => (
                    <option key={place.id} value={place.id}>
                      {t("admin.corridors.placeGone")}
                    </option>
                  ))}
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
              <div className="actions">
                <button
                  type="button"
                  className="button-quiet type-label"
                  disabled={index === 0}
                  aria-label={t("admin.corridors.moveUpNumbered", { number })}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  {t("admin.corridors.moveUp")}
                </button>
                <button
                  type="button"
                  className="button-quiet type-label"
                  disabled={index === chosen.length - 1}
                  aria-label={t("admin.corridors.moveDownNumbered", { number })}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  {t("admin.corridors.moveDown")}
                </button>
                <button
                  type="button"
                  className="button-quiet type-label"
                  disabled={chosen.length <= corridorMinPlaces}
                  aria-label={t("admin.corridors.removeNumbered", { number })}
                  onClick={() => {
                    setChosen(chosen.filter((_, at) => at !== index));
                  }}
                >
                  {t("admin.corridors.remove")}
                </button>
              </div>
            </div>
          );
        })}
        {showPlacesProblem ? (
          <p id={ids.placesError} className="field-error type-small">
            {placesProblem}
          </p>
        ) : null}
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            disabled={chosen.length >= corridorMaxPlaces}
            onClick={() => {
              setChosen([...chosen, ""]);
            }}
          >
            {t("admin.corridors.addPlace")}
          </button>
        </div>
      </div>
      {failed ? (
        <p className="problem type-body" role="alert">
          {t("admin.corridors.saveFailed")}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="button-primary type-button" disabled={saving}>
          {corridor === undefined ? t("admin.corridors.add") : t("admin.corridors.save")}
        </button>
        {onCancel === undefined ? null : (
          <button type="button" className="button-quiet type-label" onClick={onCancel}>
            {t("admin.corridors.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

function CorridorCard({
  corridor,
  places,
  onSaved,
}: {
  readonly corridor: AdminCorridor;
  readonly places: Places;
  readonly onSaved: (corridor: AdminCorridor) => void;
}) {
  const { t, call } = useConsole();
  const [changing, setChanging] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [failed, setFailed] = useState(false);

  async function count(active: boolean) {
    setSwitching(true);
    setFailed(false);
    const result = await call(adminUpdateCorridorRoute, {
      params: { id: corridor.id },
      body: { active },
    });
    setSwitching(false);
    if (result.ok) onSaved(result.data);
    else setFailed(true);
  }

  if (changing) {
    return (
      <li>
        <CorridorForm
          corridor={corridor}
          places={places}
          onSaved={(changed) => {
            setChanging(false);
            onSaved(changed);
          }}
          onCancel={() => {
            setChanging(false);
          }}
        />
      </li>
    );
  }
  return (
    <li className="card stack">
      <h3 className="type-heading">{corridor.name}</h3>
      <p className="type-body">
        {corridor.places
          .map((place) => (place.name === "" ? t("admin.corridors.placeGone") : place.name))
          .join(" – ")}
      </p>
      <p className="type-body muted">
        {corridor.active ? t("admin.corridors.counted") : t("admin.corridors.notCounted")}
      </p>
      {failed ? (
        <p className="problem type-body" role="alert">
          {t("admin.corridors.saveFailed")}
        </p>
      ) : null}
      <div className="actions">
        <button
          type="button"
          className="button-secondary type-label"
          aria-label={t("admin.corridors.changeNamed", { name: corridor.name })}
          onClick={() => {
            setChanging(true);
          }}
        >
          {t("admin.corridors.change")}
        </button>
        <button
          type="button"
          className="button-quiet type-label"
          disabled={switching}
          aria-label={t(
            corridor.active ? "admin.corridors.stopNamed" : "admin.corridors.resumeNamed",
            { name: corridor.name },
          )}
          onClick={() => void count(!corridor.active)}
        >
          {corridor.active ? t("admin.corridors.stop") : t("admin.corridors.resume")}
        </button>
      </div>
    </li>
  );
}
