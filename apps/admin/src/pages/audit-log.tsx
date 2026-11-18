import { adminAuditLogRoute, type AuditEntry } from "@shareride/contracts";
import { icelandDate } from "@shareride/domain";
import { formatClock, formatDate, type Locale, type Translate } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../console.tsx";

/** The filters the audit log takes (`GET /admin/v1/audit-log`), as kept in the address. */
const filterKeys = ["action", "subjectType", "subjectId", "operatorUserId", "from", "to"] as const;
type FilterKey = (typeof filterKeys)[number];
type Filters = Partial<Record<FilterKey, string>>;

/** The filters typed in the form; the operator is picked from an entry instead. */
type Draft = Record<Exclude<FilterKey, "operatorUserId">, string>;

/** The filters without some of them. */
function without(filters: Filters, ...keys: FilterKey[]): Filters {
  return Object.fromEntries(
    Object.entries(filters).filter(([key]) => !keys.includes(key as FilterKey)),
  );
}

function filtersFromAddress(): Filters {
  const search = new URLSearchParams(window.location.search);
  const filters: Filters = {};
  for (const key of filterKeys) {
    const value = search.get(key)?.trim() ?? "";
    if (value !== "") filters[key] = value;
  }
  return filters;
}

/** Keeps the filters in the address, so the page can be reloaded or shared as it is. */
function showInAddress(filters: Filters) {
  const search = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query === "" ? "" : `?${query}`}`,
  );
}

function draftOf(filters: Filters): Draft {
  return {
    action: filters.action ?? "",
    subjectType: filters.subjectType ?? "",
    subjectId: filters.subjectId ?? "",
    from: filters.from ?? "",
    to: filters.to ?? "",
  };
}

type Log =
  | { readonly state: "loading" }
  | { readonly state: "failed"; readonly badFilters: boolean }
  | {
      readonly state: "ready";
      readonly entries: readonly AuditEntry[];
      readonly hasMore: boolean;
      readonly older: "idle" | "loading" | "failed";
    };

/** The audit log (spec 9, 3.8): every operator action, newest first, with filters. */
export function AuditLogPage() {
  const { t, call } = useConsole();
  const [filters, setFilters] = useState<Filters>(filtersFromAddress);
  const [draft, setDraft] = useState<Draft>(() => draftOf(filters));
  const [daysWrong, setDaysWrong] = useState(false);
  const [log, setLog] = useState<Log>({ state: "loading" });
  const lastDay = useRef<HTMLInputElement>(null);
  const entriesHeading = useRef<HTMLHeadingElement>(null);
  const focusEntries = useRef(false);
  const list = useRef<HTMLOListElement>(null);
  // The first older entry takes the focus once shown, as its button may be gone.
  const focusEntryAt = useRef<number | null>(null);
  // Only the newest request may show its answer.
  const request = useRef(0);
  const ids = {
    action: useId(),
    actionHint: useId(),
    subjectType: useId(),
    subjectId: useId(),
    from: useId(),
    to: useId(),
    toError: useId(),
    entries: useId(),
    filters: useId(),
  };

  const load = useCallback(async () => {
    const mine = ++request.current;
    setLog({ state: "loading" });
    const result = await call(adminAuditLogRoute, { query: filters });
    if (mine !== request.current) return;
    setLog(
      result.ok
        ? {
            state: "ready",
            entries: result.data.entries,
            hasMore: result.data.hasMore,
            older: "idle",
          }
        : { state: "failed", badFilters: result.status === 400 },
    );
  }, [call, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (log.state !== "loading" && focusEntries.current) {
      focusEntries.current = false;
      entriesHeading.current?.focus();
    }
  }, [log.state]);

  const shownCount = log.state === "ready" ? log.entries.length : 0;
  useEffect(() => {
    const index = focusEntryAt.current;
    if (index === null || shownCount <= index) return;
    focusEntryAt.current = null;
    const entry = list.current?.children[index];
    if (entry instanceof HTMLElement) entry.focus();
  }, [shownCount]);

  async function loadOlder() {
    if (log.state !== "ready") return;
    const oldest = log.entries.at(-1);
    if (oldest === undefined) return;
    const mine = ++request.current;
    setLog({ ...log, older: "loading" });
    const result = await call(adminAuditLogRoute, { query: { ...filters, before: oldest.id } });
    if (mine !== request.current) return;
    if (result.ok) focusEntryAt.current = log.entries.length;
    setLog(
      result.ok
        ? {
            state: "ready",
            entries: [...log.entries, ...result.data.entries],
            hasMore: result.data.hasMore,
            older: "idle",
          }
        : { ...log, older: "failed" },
    );
  }

  function apply(next: Filters, moveFocus = false) {
    focusEntries.current = moveFocus;
    setDaysWrong(false);
    setDraft(draftOf(next));
    setFilters(next);
    showInAddress(next);
  }

  function applyDraft() {
    if (draft.from !== "" && draft.to !== "" && draft.to < draft.from) {
      setDaysWrong(true);
      lastDay.current?.focus();
      return;
    }
    const next: Filters = {};
    for (const key of Object.keys(draft) as (keyof Draft)[]) {
      const value = draft[key].trim();
      if (value !== "") next[key] = value;
    }
    if (filters.operatorUserId !== undefined) next.operatorUserId = filters.operatorUserId;
    apply(next);
  }

  const filtered = Object.keys(filters).length > 0;
  const field = (key: keyof Draft) => ({
    id: ids[key],
    className: "input type-body",
    value: draft[key],
    onChange: (event: { target: { value: string } }) => {
      setDraft({ ...draft, [key]: event.target.value });
      if (key === "from" || key === "to") setDaysWrong(false);
    },
  });

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.auditLog.title")}</h1>
      <p className="type-body muted">{t("admin.auditLog.intro")}</p>
      <form
        className="stack panel"
        role="search"
        aria-labelledby={ids.filters}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          applyDraft();
        }}
      >
        <h2 id={ids.filters} className="type-heading">
          {t("admin.auditLog.filters")}
        </h2>
        <div className="filter-fields">
          <div className="field">
            <label htmlFor={ids.action} className="type-label">
              {t("admin.auditLog.action")}
            </label>
            <input {...field("action")} autoComplete="off" aria-describedby={ids.actionHint} />
            <p id={ids.actionHint} className="hint type-small">
              {t("admin.auditLog.actionHint")}
            </p>
          </div>
          <div className="field">
            <label htmlFor={ids.subjectType} className="type-label">
              {t("admin.auditLog.subjectType")}
            </label>
            <input {...field("subjectType")} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={ids.subjectId} className="type-label">
              {t("admin.auditLog.subjectId")}
            </label>
            <input {...field("subjectId")} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={ids.from} className="type-label">
              {t("admin.auditLog.from")}
            </label>
            <input {...field("from")} type="date" />
          </div>
          <div className="field">
            <label htmlFor={ids.to} className="type-label">
              {t("admin.auditLog.to")}
            </label>
            <input
              {...field("to")}
              ref={lastDay}
              type="date"
              aria-invalid={daysWrong}
              aria-describedby={daysWrong ? ids.toError : undefined}
            />
            {daysWrong ? (
              <p id={ids.toError} className="field-error type-small">
                {t("admin.auditLog.toBeforeFrom")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="button-primary type-button">
            {t("admin.auditLog.apply")}
          </button>
          {filtered ? (
            <button
              type="button"
              className="button-quiet type-label"
              onClick={() => {
                apply({}, true);
              }}
            >
              {t("admin.auditLog.clear")}
            </button>
          ) : null}
        </div>
      </form>
      {filters.operatorUserId === undefined ? null : (
        <div className="notice actions">
          <p className="type-body">{t("admin.auditLog.oneOperator")}</p>
          <button
            type="button"
            className="button-quiet type-label"
            onClick={() => {
              apply(without(filters, "operatorUserId"), true);
            }}
          >
            {t("admin.auditLog.everyone")}
          </button>
        </div>
      )}
      <h2 ref={entriesHeading} id={ids.entries} className="type-heading" tabIndex={-1}>
        {t("admin.auditLog.entries")}
      </h2>
      {log.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : log.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t(log.badFilters ? "admin.auditLog.badFilters" : "admin.auditLog.loadFailed")}
          </p>
          {log.badFilters ? (
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                apply({}, true);
              }}
            >
              {t("admin.auditLog.clear")}
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
      ) : log.entries.length === 0 ? (
        <div className="stack">
          <p className="type-body muted">
            {t(filtered ? "admin.auditLog.noMatch" : "admin.auditLog.empty")}
          </p>
          {filtered ? (
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                apply({}, true);
              }}
            >
              {t("admin.auditLog.clear")}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <ol ref={list} className="cards" aria-labelledby={ids.entries}>
            {log.entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                showOperatorButton={filters.operatorUserId === undefined}
                onOnlyRecord={(subjectType, subjectId) => {
                  apply(
                    { ...without(filters, "subjectType", "subjectId"), subjectType, subjectId },
                    true,
                  );
                }}
                onOnlyOperator={(operatorUserId) => {
                  apply({ ...filters, operatorUserId }, true);
                }}
              />
            ))}
          </ol>
          {log.older === "failed" ? (
            <p className="problem type-body" role="alert">
              {t("admin.auditLog.olderFailed")}
            </p>
          ) : null}
          {log.hasMore ? (
            <button
              type="button"
              className="button-secondary type-label"
              disabled={log.older === "loading"}
              aria-busy={log.older === "loading"}
              onClick={() => void loadOlder()}
            >
              {t("admin.auditLog.older")}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** When an entry was made, in Iceland: "16 November 2026 at 22:10". */
function when(t: Translate, locale: Locale, at: string): string {
  const moment = new Date(at);
  const date = icelandDate(moment);
  return t("admin.auditLog.at", { date: formatDate(date, locale), time: formatClock(moment) });
}

function shown(value: unknown, t: Translate): string {
  if (value === undefined || value === null) return t("admin.auditLog.noValue");
  return typeof value === "string" ? value : JSON.stringify(value);
}

interface EntryCardProps {
  readonly entry: AuditEntry;
  readonly showOperatorButton: boolean;
  readonly onOnlyRecord: (subjectType: string, subjectId: string) => void;
  readonly onOnlyOperator: (operatorUserId: string) => void;
}

function EntryCard({ entry, showOperatorButton, onOnlyRecord, onOnlyOperator }: EntryCardProps) {
  const { t, locale } = useConsole();
  const changesId = useId();
  const name = entry.operator.firstName;
  const fields = [
    ...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})]),
  ];
  const { subjectType, subjectId } = entry;

  return (
    <li className="card entry" tabIndex={-1}>
      <div className="card-text">
        <p className="type-body-strong">
          <code className="action-name">{entry.action}</code>
        </p>
        <p className="type-small muted">
          <time dateTime={entry.at}>{when(t, locale, entry.at)}</time>
          {" · "}
          {name === null ? t("admin.auditLog.byNoName") : t("admin.auditLog.by", { name })}
          {entry.byCommand ? ` · ${t("admin.auditLog.byCommand")}` : null}
        </p>
        {subjectType === null || subjectId === null ? null : (
          <p className="type-small">
            {t("admin.auditLog.record", { type: subjectType, id: subjectId })}
          </p>
        )}
      </div>
      <details className="entry-details">
        <summary className="type-label">{t("admin.auditLog.details")}</summary>
        <div className="stack">
          {fields.length === 0 ? null : (
            <table className="changes type-small" aria-labelledby={changesId}>
              <caption id={changesId} className="type-label">
                {t("admin.auditLog.changes")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t("admin.auditLog.field")}</th>
                  <th scope="col">{t("admin.auditLog.before")}</th>
                  <th scope="col">{t("admin.auditLog.after")}</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field}>
                    <th scope="row">
                      <code>{field}</code>
                    </th>
                    <td>{shown(entry.before?.[field], t)}</td>
                    <td>{shown(entry.after?.[field], t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <dl className="facts type-small">
            <dt>{t("admin.auditLog.address")}</dt>
            <dd>{entry.ipAddress ?? t("admin.auditLog.unknown")}</dd>
            <dt>{t("admin.auditLog.device")}</dt>
            <dd>{entry.userAgent ?? t("admin.auditLog.unknown")}</dd>
          </dl>
        </div>
      </details>
      <div className="actions">
        {subjectType === null || subjectId === null ? null : (
          <button
            type="button"
            className="button-quiet type-label"
            aria-label={t("admin.auditLog.onlyRecordLabel", { type: subjectType, id: subjectId })}
            onClick={() => {
              onOnlyRecord(subjectType, subjectId);
            }}
          >
            {t("admin.auditLog.onlyRecord")}
          </button>
        )}
        {showOperatorButton ? (
          <button
            type="button"
            className="button-quiet type-label"
            aria-label={name === null ? undefined : t("admin.auditLog.onlyOperatorLabel", { name })}
            onClick={() => {
              onOnlyOperator(entry.operator.userId);
            }}
          >
            {t("admin.auditLog.onlyOperator")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
