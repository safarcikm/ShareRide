import {
  adminCreateMeetingPointRoute,
  adminMeetingPointRoute,
  adminUpdateMeetingPointRoute,
  type AdminMeetingPoint,
} from "@shareride/contracts";
import {
  amenities as allAmenities,
  icelandDate,
  meetingPointLimits,
  meetingPointTypes,
  regions,
  type Amenity,
} from "@shareride/domain";
import {
  amenityKeys,
  capitalised,
  formatDate,
  formatMonth,
  regionKeys,
  typeKeys,
  weekdayNames,
  type MessageKey,
} from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { IcelandMap } from "../../components/iceland-map.tsx";
import { useConsole } from "../../console.tsx";
import {
  baseField,
  emptyValues,
  inputOf,
  problemFieldsOf,
  readSpot,
  valuesOf,
  type DayHours,
  type FieldProblem,
  type FormValues,
} from "./form-values.ts";
import { meetingPointsPath } from "./list.tsx";
import { PhotosPanel } from "./photos-panel.tsx";
import { StatusPanel, type StatusResult } from "./status-panel.tsx";
import { issueKey, statusKeys, type FieldIssue } from "./texts.ts";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "missing" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly point: AdminMeetingPoint | null };

type Conflict = "save" | "status";

type Outcome =
  | { readonly kind: "none" }
  | { readonly kind: "created"; readonly name: string }
  | { readonly kind: "saved" }
  | { readonly kind: "problems"; readonly problems: readonly FieldProblem[] }
  /** Changed elsewhere since it was loaded, found on a save or a status change. */
  | { readonly kind: "changed"; readonly on: Conflict }
  | { readonly kind: "reloaded"; readonly on: Conflict }
  | { readonly kind: "failed" }
  /** A status changed: what it came to, naming the point. */
  | { readonly kind: "status"; readonly text: MessageKey; readonly name: string }
  | { readonly kind: "statusFailed" };

/** The fields typed as text. */
type TextField =
  | "nameIs"
  | "nameEn"
  | "aliases"
  | "municipality"
  | "whereToStandIs"
  | "whereToStandEn"
  | "shelterNoteIs"
  | "shelterNoteEn";

const months = Array.from({ length: 12 }, (_, index) => index + 1);

const osmLink = (latitude: number, longitude: number) =>
  `https://www.openstreetmap.org/?mlat=${String(latitude)}&mlon=${String(longitude)}#map=17/${String(latitude)}/${String(longitude)}`;

/** Create a meeting point, or edit one (spec 2, 3.6.2). `id` is undefined for a new one. */
export function MeetingPointForm({ id }: { readonly id: string | undefined }) {
  const { t, locale, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>(
    id === undefined ? { state: "ready", point: null } : { state: "loading" },
  );
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  // Fields changed since the last check: their errors are gone until the next save.
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const message = useRef<HTMLDivElement>(null);
  const base = useId();
  const idOf = (field: string) => `${base}-${field.replace(".", "-")}`;
  // "Pause … now" on a problem report leads here with ?pause: the pause opens
  // once, and the address drops it, so a reload does not open it again.
  const [startPausing] = useState(() => new URLSearchParams(window.location.search).has("pause"));
  useEffect(() => {
    if (startPausing) window.history.replaceState(null, "", window.location.pathname);
  }, [startPausing]);

  /** Loads the point; after a conflict the form stays in place while it does. */
  const load = useCallback(
    async (pointId: string, after: Conflict | null = null) => {
      if (after === null) setLoaded({ state: "loading" });
      const result = await call(adminMeetingPointRoute, { params: { id: pointId } });
      if (result.ok) {
        setValues(valuesOf(result.data));
        setLoaded({ state: "ready", point: result.data });
        setEdited(new Set());
        if (after !== null) setOutcome({ kind: "reloaded", on: after });
      } else {
        setLoaded({ state: result.status === 404 ? "missing" : "failed" });
      }
    },
    [call],
  );

  useEffect(() => {
    if (id !== undefined) void load(id);
  }, [load, id]);

  // A result or the problems take the focus, so they are read at once.
  useEffect(() => {
    const shown = message.current?.firstElementChild;
    if (outcome.kind !== "none" && shown instanceof HTMLElement) shown.focus();
  }, [outcome]);

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
        <ConsoleLink to={meetingPointsPath} className="type-label">
          {t("admin.meetingPoint.back")}
        </ConsoleLink>
        <p className="problem type-body" role="alert">
          {t(
            loaded.state === "missing"
              ? "admin.meetingPoint.notFound"
              : "admin.meetingPoint.loadFailed",
          )}
        </p>
      </section>
    );
  }

  const { point } = loaded;
  const retired = point?.status === "retired";
  const spotLocked = point !== null && point.status !== "draft";
  const today = icelandDate(new Date());
  const problems =
    outcome.kind === "problems"
      ? outcome.problems.filter((problem) => !edited.has(baseField(problem.field)))
      : [];
  // Each day of the hours has its own field; the other names share one.
  const problemOf = (field: string) =>
    problems.find(
      (problem) =>
        problem.field === field || (field === "aliases" && baseField(problem.field) === "aliases"),
    );
  /** The field a problem's link goes to. */
  const fieldFor = (field: string) => (baseField(field) === "aliases" ? "aliases" : field);
  const spot = readSpot(values.spot);
  const spotProblem: FieldIssue | null =
    problemOf("position")?.issue ?? ("problem" in spot ? spot.problem : null);
  const hasShelter = values.amenities.includes("shelter");
  const set = (change: Partial<FormValues>) => {
    setValues({ ...values, ...change });
    const touched = problemFieldsOf(change);
    if (touched.length > 0) setEdited(new Set([...edited, ...touched]));
  };
  const dayName = (index: number) => capitalised(weekdayNames[locale][index] ?? "", locale);

  /** A field's label, for the problem list. */
  const labelOf = (field: string): string => {
    const [name, index] = field.split(".");
    const labels: Record<string, MessageKey> = {
      nameIs: "admin.meetingPoint.nameIs",
      nameEn: "admin.meetingPoint.nameEn",
      aliases: "admin.meetingPoint.aliases",
      position: "admin.meetingPoint.spot",
      region: "admin.meetingPoints.region",
      municipality: "admin.meetingPoint.municipality",
      type: "admin.meetingPoints.type",
      amenities: "meetingPoints.amenities",
      whereToStandIs: "admin.meetingPoint.whereToStandIs",
      whereToStandEn: "admin.meetingPoint.whereToStandEn",
      shelterHours: "admin.meetingPoint.giveHours",
      shelterNoteIs: "admin.meetingPoint.shelterNoteIs",
      shelterNoteEn: "admin.meetingPoint.shelterNoteEn",
      season: "admin.meetingPoints.season",
      lastCheckedOn: "admin.meetingPoint.lastCheckedOn",
    };
    if (name === "shelterHours" && index !== undefined) return dayName(Number(index));
    const key = labels[name ?? ""];
    return key === undefined ? field : t(key);
  };
  const issueText = (field: string, issue: FieldIssue) =>
    t(issueKey(field, issue), { max: meetingPointLimits.aliasesMax });

  /** The error under a field, and what the field needs to point at it. */
  const errorFor = (field: string, issue?: FieldIssue | null) => {
    const found = issue ?? problemOf(field)?.issue;
    if (found === undefined) return { describedBy: undefined, error: null };
    const errorId = `${idOf(field)}-error`;
    return {
      describedBy: errorId,
      error: (
        <p id={errorId} className="field-error type-small">
          {issueText(field, found)}
        </p>
      ),
    };
  };

  async function save() {
    setEdited(new Set());
    const checked = inputOf(values, today);
    if ("problems" in checked) {
      setOutcome({ kind: "problems", problems: checked.problems });
      return;
    }
    setSaving(true);
    const result =
      point === null
        ? await call(adminCreateMeetingPointRoute, { body: checked.input })
        : await call(adminUpdateMeetingPointRoute, {
            params: { id: point.id },
            body: { ...checked.input, updatedAt: point.updatedAt },
          });
    setSaving(false);
    if (result.ok) {
      setValues(valuesOf(result.data));
      setLoaded({ state: "ready", point: result.data });
      if (point === null) {
        // The new draft's own address, without opening the page again.
        window.history.replaceState(null, "", `${meetingPointsPath}/${result.data.id}`);
        setOutcome({ kind: "created", name: result.data.nameIs });
      } else {
        setOutcome({ kind: "saved" });
      }
      return;
    }
    const { code, details } = result.error;
    if (code === "validation_failed" && details !== undefined && details.length > 0) {
      setOutcome({
        kind: "problems",
        problems: details.map((detail) => ({
          field: detail.path,
          issue: detail.issue as FieldIssue,
        })),
      });
    } else if (code === "move_needed") {
      setOutcome({ kind: "problems", problems: [{ field: "position", issue: "move_needed" }] });
    } else if (code === "meeting_point_changed") {
      setOutcome({ kind: "changed", on: "save" });
    } else if (code === "meeting_point_retired") {
      // Retired since it was opened: the newest copy shows it.
      setOutcome({ kind: "changed", on: "save" });
    } else {
      setOutcome({ kind: "failed" });
    }
  }

  const text = (
    field: TextField,
    label: MessageKey,
    options: { hint?: MessageKey; multiline?: boolean; problemField?: string } = {},
  ) => {
    const problemField = options.problemField ?? field;
    const { describedBy, error } = errorFor(problemField);
    const hintId = `${idOf(field)}-hint`;
    const described = [options.hint === undefined ? null : hintId, describedBy]
      .filter((part) => part !== null && part !== undefined)
      .join(" ");
    const shared = {
      id: idOf(problemField),
      className: options.multiline === true ? "input textarea type-body" : "input type-body",
      value: values[field],
      "aria-invalid": error !== null,
      "aria-describedby": described === "" ? undefined : described,
    };
    return (
      <div className="field">
        <label htmlFor={shared.id} className="type-label">
          {t(label)}
        </label>
        {options.multiline === true ? (
          <textarea
            {...shared}
            rows={3}
            onChange={(event) => {
              set({ [field]: event.target.value });
            }}
          />
        ) : (
          <input
            {...shared}
            autoComplete="off"
            onChange={(event) => {
              set({ [field]: event.target.value });
            }}
          />
        )}
        {options.hint === undefined ? null : (
          <p id={hintId} className="hint type-small">
            {t(options.hint)}
          </p>
        )}
        {error}
      </div>
    );
  };

  const choose = (
    field: "region" | "type",
    label: MessageKey,
    options: readonly { value: string; label: string }[],
  ) => {
    const { describedBy, error } = errorFor(field);
    return (
      <div className="field">
        <label htmlFor={idOf(field)} className="type-label">
          {t(label)}
        </label>
        <select
          id={idOf(field)}
          className="input type-body"
          value={values[field]}
          aria-invalid={error !== null}
          aria-describedby={describedBy}
          onChange={(event) => {
            set({ [field]: event.target.value });
          }}
        >
          <option value="">{t("admin.meetingPoint.choose")}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error}
      </div>
    );
  };

  const check = (
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    more: { id?: string; after?: ReactNode } = {},
  ) => (
    <p className="check-row">
      <label className="check type-body">
        <input
          id={more.id}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        {label}
      </label>
      {more.after}
    </p>
  );

  const reviewedNote = (date: string | null | undefined) =>
    date === null || date === undefined ? null : (
      <span className="hint type-small">
        {t("admin.meetingPoint.checkedOn", { date: formatDate(date, locale) })}
      </span>
    );

  const setDay = (index: number, change: Partial<DayHours>) => {
    set({ hours: values.hours.map((day, at) => (at === index ? { ...day, ...change } : day)) });
  };

  /** A status changed: the newest copy, and the form keeps what was typed in it. */
  const statusChanged = (result: StatusResult) => {
    if (result.kind === "changed") {
      setOutcome({ kind: "changed", on: "status" });
    } else if (result.kind === "failed") {
      setOutcome({ kind: "statusFailed" });
    } else {
      setLoaded({ state: "ready", point: result.point });
      const text: MessageKey =
        result.change === "pause"
          ? "admin.meetingPoint.paused"
          : result.change === "resume"
            ? "admin.meetingPoint.resumed"
            : result.point.status === "retiring"
              ? "admin.meetingPoint.retiring"
              : "admin.meetingPoint.retired";
      setOutcome({ kind: "status", text, name: result.point.nameIs });
    }
  };

  const title = point === null ? t("admin.meetingPoint.newTitle") : point.nameIs;
  const amenitiesError = errorFor("amenities");
  const hoursError = errorFor("shelterHours");
  const seasonError = errorFor("season");
  const spotError = errorFor("position", spotProblem);

  return (
    <section className="stack">
      <ConsoleLink to={meetingPointsPath} className="type-label">
        {t("admin.meetingPoint.back")}
      </ConsoleLink>
      <h1 className="type-title">{title}</h1>
      {point === null ? null : (
        <p className="tags">
          <span className="type-body">
            {t("admin.meetingPoint.statusLine", { status: t(statusKeys[point.status]) })}
          </span>
          {point.sample ? (
            <span className="tag type-small">{t("admin.meetingPoints.sampleTag")}</span>
          ) : null}
        </p>
      )}
      {point?.sample === true ? (
        <p className="notice type-body">{t("admin.meetingPoint.sampleNotice")}</p>
      ) : null}
      {retired ? <p className="notice type-body">{t("admin.meetingPoint.retiredNotice")}</p> : null}

      <div ref={message} className="message">
        {outcome.kind === "created" || outcome.kind === "saved" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {outcome.kind === "created"
              ? t("admin.meetingPoint.created", { name: outcome.name })
              : t("admin.meetingPoint.saved")}
          </p>
        ) : outcome.kind === "problems" ? (
          <div className="problem stack" role="alert" tabIndex={-1}>
            <p className="type-body">
              {t("admin.meetingPoint.problems", { count: outcome.problems.length })}
            </p>
            <ul className="problem-list">
              {outcome.problems.map((problem) => (
                <li key={problem.field}>
                  <a
                    href={`#${idOf(fieldFor(problem.field))}`}
                    className="type-body"
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(idOf(fieldFor(problem.field)))?.focus();
                    }}
                  >
                    {labelOf(problem.field)}: {issueText(problem.field, problem.issue)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : outcome.kind === "changed" ? (
          <div className="problem stack" role="alert" tabIndex={-1}>
            <p className="type-body">{t("admin.meetingPoint.changedElsewhere")}</p>
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                if (point !== null) void load(point.id, outcome.on);
              }}
            >
              {t("admin.meetingPoint.reload")}
            </button>
          </div>
        ) : outcome.kind === "reloaded" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {t(
              outcome.on === "status"
                ? "admin.meetingPoint.reloadedStatus"
                : "admin.meetingPoint.reloaded",
            )}
          </p>
        ) : outcome.kind === "failed" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.meetingPoint.saveFailed")}
          </p>
        ) : outcome.kind === "status" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {t(outcome.text, { name: outcome.name })}
          </p>
        ) : outcome.kind === "statusFailed" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.meetingPoint.statusFailed")}
          </p>
        ) : null}
      </div>

      {point === null ? null : (
        <StatusPanel point={point} onResult={statusChanged} startPausing={startPausing} />
      )}

      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className="form-sections" disabled={retired}>
          <fieldset className="panel stack">
            <legend className="type-heading">{t("admin.meetingPoint.names")}</legend>
            {text("nameIs", "admin.meetingPoint.nameIs")}
            {text("nameEn", "admin.meetingPoint.nameEn")}
            {text("aliases", "admin.meetingPoint.aliases", {
              hint: "admin.meetingPoint.aliasesHint",
              multiline: true,
            })}
          </fieldset>

          <fieldset className="panel stack">
            <legend className="type-heading">{t("admin.meetingPoint.place")}</legend>
            <div className="field">
              <label htmlFor={idOf("position")} className="type-label">
                {t("admin.meetingPoint.spot")}
              </label>
              <input
                id={idOf("position")}
                className="input wide type-body"
                autoComplete="off"
                value={values.spot}
                readOnly={spotLocked}
                aria-invalid={spotError.error !== null}
                aria-describedby={[`${idOf("position")}-hint`, spotError.describedBy]
                  .filter((part) => part !== undefined)
                  .join(" ")}
                onChange={(event) => {
                  set({ spot: event.target.value });
                }}
              />
              <p id={`${idOf("position")}-hint`} className="hint type-small">
                {t(spotLocked ? "admin.meetingPoint.spotLocked" : "admin.meetingPoint.spotHint")}
              </p>
              {spotError.error}
              {"position" in spot ? (
                <p className="type-body" role="status">
                  {t("admin.meetingPoint.spotReads", {
                    latitude: String(spot.position.latitude),
                    longitude: String(spot.position.longitude),
                  })}
                </p>
              ) : null}
            </div>
            {"position" in spot ? (
              <div className="spot-map stack">
                <IcelandMap
                  label={t("meetingPoints.pointMap", {
                    name: values.nameIs.trim() === "" ? title : values.nameIs.trim(),
                  })}
                  dots={[{ id: "spot", position: spot.position, look: "chosen" }]}
                  fit
                />
                <a
                  className="type-label"
                  href={osmLink(spot.position.latitude, spot.position.longitude)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("admin.meetingPoint.openInMaps")}
                </a>
              </div>
            ) : null}
            {choose(
              "region",
              "admin.meetingPoints.region",
              regions.map((region) => ({ value: region, label: t(regionKeys[region]) })),
            )}
            {text("municipality", "admin.meetingPoint.municipality")}
            {choose(
              "type",
              "admin.meetingPoints.type",
              meetingPointTypes.map((type) => ({ value: type, label: t(typeKeys[type]) })),
            )}
          </fieldset>

          <fieldset
            className="panel stack"
            aria-describedby={amenitiesError.describedBy}
            aria-invalid={amenitiesError.error !== null}
          >
            <legend className="type-heading">{t("meetingPoints.amenities")}</legend>
            <div className="checks">
              {allAmenities.map((amenity: Amenity, index) =>
                check(
                  t(amenityKeys[amenity]),
                  values.amenities.includes(amenity),
                  (checked) => {
                    set({
                      amenities: checked
                        ? [...values.amenities, amenity]
                        : values.amenities.filter((one) => one !== amenity),
                    });
                  },
                  index === 0 ? { id: idOf("amenities") } : {},
                ),
              )}
            </div>
            {amenitiesError.error}
            {check(
              t("admin.meetingPoint.amenitiesReviewed"),
              values.amenitiesReviewed,
              (checked) => {
                set({ amenitiesReviewed: checked });
              },
              { after: values.amenitiesReviewed ? reviewedNote(point?.amenitiesReviewedOn) : null },
            )}
          </fieldset>

          <fieldset className="panel stack">
            <legend className="type-heading">{t("meetingPoints.whereToStand")}</legend>
            {text("whereToStandIs", "admin.meetingPoint.whereToStandIs", {
              hint: "admin.meetingPoint.whereToStandHint",
              multiline: true,
            })}
            {text("whereToStandEn", "admin.meetingPoint.whereToStandEn", { multiline: true })}
          </fieldset>

          <fieldset className="panel stack">
            <legend className="type-heading">{t("admin.meetingPoint.shelter")}</legend>
            {!hasShelter ? (
              <p className="hint type-body">{t("admin.meetingPoint.shelterNone")}</p>
            ) : (
              <>
                {check(
                  t("admin.meetingPoint.giveHours"),
                  values.giveHours,
                  (checked) => {
                    set({ giveHours: checked });
                  },
                  { id: idOf("shelterHours") },
                )}
                {hoursError.error}
                {values.giveHours ? (
                  <div className="stack">
                    <table className="hours">
                      <caption className="type-label">{t("admin.meetingPoint.hours")}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="type-small">
                            {t("admin.meetingPoint.day")}
                          </th>
                          <th scope="col" className="type-small">
                            {t("admin.meetingPoint.opens")}
                          </th>
                          <th scope="col" className="type-small">
                            {t("admin.meetingPoint.closes")}
                          </th>
                          <th scope="col" className="type-small">
                            {t("admin.meetingPoint.closed")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {values.hours.map((day, index) => {
                          const field = `shelterHours.${String(index)}`;
                          const dayError = errorFor(field);
                          const name = dayName(index);
                          return (
                            <tr key={name}>
                              <th scope="row" className="type-body">
                                {name}
                                {dayError.error}
                              </th>
                              <td>
                                <input
                                  id={idOf(field)}
                                  type="time"
                                  className="input type-body"
                                  aria-label={t("admin.meetingPoint.opensOn", { day: name })}
                                  aria-invalid={dayError.error !== null}
                                  aria-describedby={dayError.describedBy}
                                  value={day.opens}
                                  disabled={day.closed}
                                  onChange={(event) => {
                                    setDay(index, { opens: event.target.value });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="time"
                                  className="input type-body"
                                  aria-label={t("admin.meetingPoint.closesOn", { day: name })}
                                  aria-invalid={dayError.error !== null}
                                  aria-describedby={dayError.describedBy}
                                  value={day.closes}
                                  disabled={day.closed}
                                  onChange={(event) => {
                                    setDay(index, { closes: event.target.value });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  className="day-closed"
                                  aria-label={t("admin.meetingPoint.closedOn", { day: name })}
                                  checked={day.closed}
                                  onChange={(event) => {
                                    setDay(index, { closed: event.target.checked });
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="hint type-small">{t("admin.meetingPoint.hoursHint")}</p>
                  </div>
                ) : null}
                {text("shelterNoteIs", "admin.meetingPoint.shelterNoteIs", { multiline: true })}
                {text("shelterNoteEn", "admin.meetingPoint.shelterNoteEn", { multiline: true })}
              </>
            )}
          </fieldset>

          <fieldset className="panel stack">
            <legend className="type-heading">{t("admin.meetingPoints.season")}</legend>
            <div className="checks" role="radiogroup" aria-label={t("admin.meetingPoints.season")}>
              {[false, true].map((seasonal) => (
                <label key={String(seasonal)} className="check type-body">
                  <input
                    type="radio"
                    name={`${base}-seasonal`}
                    checked={values.seasonal === seasonal}
                    onChange={() => {
                      set({ seasonal });
                    }}
                  />
                  {t(seasonal ? "admin.meetingPoint.someMonths" : "meetingPoints.inUseAllYear")}
                </label>
              ))}
            </div>
            {values.seasonal ? (
              <div className="filter-fields">
                {(["startMonth", "endMonth"] as const).map((key) => (
                  <div className="field" key={key}>
                    <label
                      htmlFor={key === "startMonth" ? idOf("season") : idOf("season-end")}
                      className="type-label"
                    >
                      {t(
                        key === "startMonth"
                          ? "admin.meetingPoint.fromMonth"
                          : "admin.meetingPoint.toMonth",
                      )}
                    </label>
                    <select
                      id={key === "startMonth" ? idOf("season") : idOf("season-end")}
                      className="input type-body"
                      value={values[key]}
                      aria-invalid={seasonError.error !== null}
                      aria-describedby={seasonError.describedBy}
                      onChange={(event) => {
                        set({ [key]: event.target.value });
                      }}
                    >
                      <option value="">{t("admin.meetingPoint.choose")}</option>
                      {months.map((month) => (
                        <option key={month} value={String(month)}>
                          {capitalised(formatMonth(month, locale), locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}
            {seasonError.error}
            {check(
              t("admin.meetingPoint.seasonReviewed"),
              values.seasonReviewed,
              (checked) => {
                set({ seasonReviewed: checked });
              },
              { after: values.seasonReviewed ? reviewedNote(point?.seasonReviewedOn) : null },
            )}
          </fieldset>

          <fieldset className="panel stack">
            <legend className="type-heading">{t("admin.meetingPoint.confirmed")}</legend>
            <div className="field">
              <label htmlFor={idOf("lastCheckedOn")} className="type-label">
                {t("admin.meetingPoint.lastCheckedOn")}
              </label>
              <input
                id={idOf("lastCheckedOn")}
                type="date"
                className="input type-body"
                max={today}
                value={values.lastCheckedOn}
                aria-invalid={errorFor("lastCheckedOn").error !== null}
                aria-describedby={[
                  `${idOf("lastCheckedOn")}-hint`,
                  errorFor("lastCheckedOn").describedBy,
                ]
                  .filter((part) => part !== undefined)
                  .join(" ")}
                onChange={(event) => {
                  set({ lastCheckedOn: event.target.value });
                }}
              />
              <p id={`${idOf("lastCheckedOn")}-hint`} className="hint type-small">
                {t("admin.meetingPoint.lastCheckedHint")}
              </p>
              {errorFor("lastCheckedOn").error}
            </div>
          </fieldset>
        </fieldset>
        {retired ? null : (
          <button type="submit" className="button-primary type-button" disabled={saving}>
            {t(point === null ? "admin.meetingPoint.create" : "admin.meetingPoint.save")}
          </button>
        )}
      </form>

      {point === null ? null : <PhotosPanel key={point.id} point={point} />}
    </section>
  );
}
