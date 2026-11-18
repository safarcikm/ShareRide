import type { CallInput } from "@shareride/api-client";
import { adminMeetingPointsRoute, type AdminMeetingPointListItem } from "@shareride/contracts";
import {
  icelandDate,
  isReviewOverdue,
  meetingPointStatuses,
  meetingPointTypes,
  regions,
  seasonFilters,
  type SeasonFilter,
} from "@shareride/domain";
import { formatDate, regionKeys, seasonText, typeKeys, type MessageKey } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { IcelandMap } from "../../components/iceland-map.tsx";
import { useConsole } from "../../console.tsx";
import { statusKeys } from "./texts.ts";

export const meetingPointsPath = "/admin/meeting-points";

/** The filters the list takes (`GET /admin/v1/meeting-points`), in the address's order. */
const filterKeys = [
  "status",
  "region",
  "type",
  "season",
  "reviewOverdue",
  "openIssues",
  "q",
] as const;
type FilterKey = (typeof filterKeys)[number];
type Filters = Partial<Record<FilterKey, string>>;

const seasonKeys = {
  "all-year": "admin.meetingPoints.allYear",
  "in-season": "admin.meetingPoints.inSeason",
  "out-of-season": "admin.meetingPoints.outOfSeason",
} as const satisfies Record<SeasonFilter, MessageKey>;

function filtersFromAddress(): Filters {
  const search = new URLSearchParams(window.location.search);
  const filters: Filters = {};
  for (const key of filterKeys) {
    const value = search.get(key)?.trim() ?? "";
    if (value !== "") filters[key] = value;
  }
  return filters;
}

/** Keeps the filters in the address, so the list can be reloaded or shared as it is. */
function showInAddress(filters: Filters) {
  const search = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  window.history.replaceState(null, "", `${meetingPointsPath}${query === "" ? "" : `?${query}`}`);
}

type Query = NonNullable<CallInput<typeof adminMeetingPointsRoute>["query"]>;

/**
 * The filters as the API takes them, the boxes as flags. Values from the
 * address are sent as they are; the API refuses one it does not know.
 */
const queryOf = (filters: Filters): Query => {
  const { reviewOverdue, openIssues, ...rest } = filters;
  return {
    ...rest,
    ...(reviewOverdue === "true" ? { reviewOverdue: true } : {}),
    ...(openIssues === "true" ? { openIssues: true } : {}),
  } as Query;
};

type List =
  | { readonly state: "loading" }
  | { readonly state: "failed"; readonly badFilters: boolean }
  | { readonly state: "ready"; readonly points: readonly AdminMeetingPointListItem[] };

/** Every meeting point, with filters, on the map and in a list (spec 2, 3.6.1). */
export function MeetingPointList() {
  const { t, locale, call } = useConsole();
  const [filters, setFilters] = useState<Filters>(filtersFromAddress);
  const [draft, setDraft] = useState<Filters>(filters);
  const [list, setList] = useState<List>({ state: "loading" });
  const listHeading = useRef<HTMLHeadingElement>(null);
  const focusList = useRef(false);
  // Only the newest request may show its answer.
  const request = useRef(0);
  const ids = {
    filters: useId(),
    q: useId(),
    status: useId(),
    region: useId(),
    type: useId(),
    season: useId(),
    overdue: useId(),
    openIssues: useId(),
    list: useId(),
  };

  const load = useCallback(async () => {
    const mine = ++request.current;
    setList({ state: "loading" });
    // Sent as typed: the API reads the query as it was meant (R2.6).
    const result = await call(adminMeetingPointsRoute, { query: queryOf(filters) });
    if (mine !== request.current) return;
    setList(
      result.ok
        ? { state: "ready", points: result.data.meetingPoints }
        : { state: "failed", badFilters: result.status === 400 },
    );
  }, [call, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (list.state !== "loading" && focusList.current) {
      focusList.current = false;
      listHeading.current?.focus();
    }
  }, [list.state]);

  function apply(next: Filters, moveFocus = false) {
    focusList.current = moveFocus;
    setDraft(next);
    setFilters(next);
    showInAddress(next);
  }

  const filtered = Object.keys(filters).length > 0;
  const choice = (key: Exclude<FilterKey, "q" | "reviewOverdue">) => ({
    id: ids[key],
    className: "input type-body",
    value: draft[key] ?? "",
    onChange: (event: { target: { value: string } }) => {
      setDraft({ ...draft, [key]: event.target.value === "" ? undefined : event.target.value });
    },
  });
  const today = icelandDate(new Date());

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.meetingPoints.title")}</h1>
      <p className="type-body muted">{t("admin.meetingPoints.intro")}</p>
      <div className="actions">
        <ConsoleLink
          to={`${meetingPointsPath}/new`}
          className="button-primary link-button type-button"
        >
          {t("admin.meetingPoints.add")}
        </ConsoleLink>
        <ConsoleLink
          to={`${meetingPointsPath}/import`}
          className="button-secondary link-button type-label"
        >
          {t("admin.meetingPoints.import")}
        </ConsoleLink>
        <ConsoleLink
          to={`${meetingPointsPath}/problems`}
          className="button-secondary link-button type-label"
        >
          {t("admin.meetingPoints.problems")}
        </ConsoleLink>
        <ConsoleLink
          to={`${meetingPointsPath}/distances`}
          className="button-secondary link-button type-label"
        >
          {t("admin.meetingPoints.distances")}
        </ConsoleLink>
      </div>
      <form
        className="stack panel"
        role="search"
        aria-labelledby={ids.filters}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const next: Filters = {};
          for (const key of filterKeys) {
            const value = draft[key]?.trim() ?? "";
            if (value !== "") next[key] = value;
          }
          apply(next);
        }}
      >
        <h2 id={ids.filters} className="type-heading">
          {t("admin.meetingPoints.filters")}
        </h2>
        <div className="filter-fields">
          <div className="field">
            <label htmlFor={ids.q} className="type-label">
              {t("admin.meetingPoints.name")}
            </label>
            <input
              id={ids.q}
              className="input type-body"
              type="search"
              autoComplete="off"
              value={draft.q ?? ""}
              onChange={(event) => {
                setDraft({ ...draft, q: event.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.status} className="type-label">
              {t("admin.meetingPoints.status")}
            </label>
            <select {...choice("status")}>
              <option value="">{t("admin.meetingPoints.any")}</option>
              {meetingPointStatuses.map((status) => (
                <option key={status} value={status}>
                  {t(statusKeys[status])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.region} className="type-label">
              {t("admin.meetingPoints.region")}
            </label>
            <select {...choice("region")}>
              <option value="">{t("admin.meetingPoints.any")}</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {t(regionKeys[region])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.type} className="type-label">
              {t("admin.meetingPoints.type")}
            </label>
            <select {...choice("type")}>
              <option value="">{t("admin.meetingPoints.any")}</option>
              {meetingPointTypes.map((type) => (
                <option key={type} value={type}>
                  {t(typeKeys[type])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.season} className="type-label">
              {t("admin.meetingPoints.season")}
            </label>
            <select {...choice("season")}>
              <option value="">{t("admin.meetingPoints.any")}</option>
              {seasonFilters.map((season) => (
                <option key={season} value={season}>
                  {t(seasonKeys[season])}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="check type-body" htmlFor={ids.overdue}>
          <input
            id={ids.overdue}
            type="checkbox"
            checked={draft.reviewOverdue === "true"}
            onChange={(event) => {
              setDraft({ ...draft, reviewOverdue: event.target.checked ? "true" : undefined });
            }}
          />
          {t("admin.meetingPoints.reviewOverdueOnly")}
        </label>
        <label className="check type-body" htmlFor={ids.openIssues}>
          <input
            id={ids.openIssues}
            type="checkbox"
            checked={draft.openIssues === "true"}
            onChange={(event) => {
              setDraft({ ...draft, openIssues: event.target.checked ? "true" : undefined });
            }}
          />
          {t("admin.meetingPoints.openIssuesOnly")}
        </label>
        <div className="actions">
          <button type="submit" className="button-primary type-button">
            {t("admin.meetingPoints.apply")}
          </button>
          {filtered ? (
            <button
              type="button"
              className="button-quiet type-label"
              onClick={() => {
                apply({}, true);
              }}
            >
              {t("admin.meetingPoints.clear")}
            </button>
          ) : null}
        </div>
      </form>
      <h2 ref={listHeading} id={ids.list} className="type-heading" tabIndex={-1}>
        {t("admin.meetingPoints.list")}
      </h2>
      {list.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t(
              list.badFilters ? "admin.meetingPoints.badFilters" : "admin.meetingPoints.loadFailed",
            )}
          </p>
          {list.badFilters ? (
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                apply({}, true);
              }}
            >
              {t("admin.meetingPoints.clear")}
            </button>
          ) : (
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => void load()}
            >
              {t("admin.retry")}
            </button>
          )}
        </div>
      ) : list.points.length === 0 ? (
        <div className="stack">
          <p className="type-body muted">
            {t(filtered ? "admin.meetingPoints.noMatch" : "admin.meetingPoints.empty")}
          </p>
          {filtered ? (
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                apply({}, true);
              }}
            >
              {t("admin.meetingPoints.clear")}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="type-body" role="status">
            {t("admin.meetingPoints.count", { count: list.points.length })}
          </p>
          <div className="split">
            <IcelandMap
              label={t("meetingPoints.mapLabel", { count: list.points.length })}
              dots={list.points.map((point) => ({ id: point.id, position: point.position }))}
            />
            <ul className="cards" aria-labelledby={ids.list}>
              {list.points.map((point) => (
                <li key={point.id} className="card point-card">
                  <div className="card-text">
                    <p className="type-heading">
                      <ConsoleLink to={`${meetingPointsPath}/${point.id}`}>
                        {point.nameIs}
                      </ConsoleLink>
                    </p>
                    <p className="type-body muted">
                      {t("meetingPoints.detailsLine", {
                        type: t(typeKeys[point.type]),
                        municipality: point.municipality,
                        region: t(regionKeys[point.region]),
                      })}
                    </p>
                    <p className="type-body muted">{seasonText(t, locale, point.season)}</p>
                    {point.reviewDueOn === null ? null : (
                      <p className="type-small muted">
                        {t("admin.meetingPoints.reviewDue", {
                          date: formatDate(point.reviewDueOn, locale),
                        })}
                      </p>
                    )}
                  </div>
                  <p className="tags">
                    <span className={`tag status-${point.status} type-small`}>
                      {t(statusKeys[point.status])}
                    </span>
                    {point.sample ? (
                      <span className="tag type-small">{t("admin.meetingPoints.sampleTag")}</span>
                    ) : null}
                    {isReviewOverdue(point.reviewDueOn, today) ? (
                      <span className="tag tag-warning type-small">
                        {t("admin.meetingPoints.reviewOverdue")}
                      </span>
                    ) : null}
                    {point.openIssues > 0 ? (
                      <span className="tag tag-warning type-small">
                        {t("admin.meetingPoints.openIssues", { count: point.openIssues })}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
