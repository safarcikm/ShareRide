import { adminReportsRoute, type AdminReportListItem } from "@shareride/contracts";
import { reportCategoryText } from "@shareride/i18n";
import { useCallback, useEffect, useId, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { atText, outcomeKeys, personName, reportsPath, subjectKeys } from "./texts.ts";

type View = "open" | "closed";

/** The view in the address: `?state=closed`, or the open reports. */
const viewFromAddress = (): View =>
  new URLSearchParams(window.location.search).get("state") === "closed" ? "closed" : "open";

type List =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly reports: readonly AdminReportListItem[] };

/**
 * The open reports, safety first, then the oldest, each with the time it is
 * to be answered by (spec 9, 3.4.1; R9.9); or the last ones closed.
 */
export function ReportList() {
  const { t, locale, call } = useConsole();
  const [view] = useState(viewFromAddress);
  const [list, setList] = useState<List>({ state: "loading" });
  const ids = { list: useId() };

  const load = useCallback(async () => {
    setList({ state: "loading" });
    const result = await call(adminReportsRoute, { query: { state: view } });
    setList(result.ok ? { state: "ready", reports: result.data.reports } : { state: "failed" });
  }, [call, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = view === "open";
  const now = Date.now();

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.reports.title")}</h1>
      <p className="type-body muted">{t("admin.reports.intro")}</p>
      <nav className="views" aria-label={t("admin.reports.views")}>
        <ConsoleLink
          to={reportsPath}
          current={open}
          className="button-secondary link-button type-label"
        >
          {t("admin.reports.open")}
        </ConsoleLink>
        <ConsoleLink
          to={`${reportsPath}?state=closed`}
          current={!open}
          className="button-secondary link-button type-label"
        >
          {t("admin.reports.closed")}
        </ConsoleLink>
      </nav>
      <h2 id={ids.list} className="type-heading">
        {t(open ? "admin.reports.openHeading" : "admin.reports.closedHeading")}
      </h2>
      {list.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.reports.loadFailed")}
          </p>
          <button type="button" className="button-secondary type-label" onClick={() => void load()}>
            {t("admin.retry")}
          </button>
        </div>
      ) : list.reports.length === 0 ? (
        <p className="type-body muted">
          {t(open ? "admin.reports.noneOpen" : "admin.reports.noneClosed")}
        </p>
      ) : (
        <>
          <p className="type-body" role="status">
            {t(open ? "admin.reports.openCount" : "admin.reports.closedCount", {
              count: list.reports.length,
            })}
          </p>
          <ul className="cards" aria-labelledby={ids.list}>
            {list.reports.map((report) => {
              const overdue = report.status === "open" && Date.parse(report.dueAt) <= now;
              return (
                <li key={report.id} className="card">
                  <div className="card-text">
                    <p className="type-heading">
                      <ConsoleLink to={`${reportsPath}/${report.id}`}>
                        {t("admin.reports.cardTitle", {
                          subject: t(subjectKeys[report.subject]),
                          category: reportCategoryText(t, report.category),
                        })}
                      </ConsoleLink>
                    </p>
                    <p className="type-body">
                      {t("admin.reports.people", {
                        reporter: personName(t, report.reporter),
                        reported: personName(t, report.reported),
                      })}
                    </p>
                    <p className="type-small muted">
                      {`${t("admin.reports.filed", { when: atText(t, locale, report.filedAt) })} · `}
                      {report.closedAt !== null
                        ? t("admin.reports.closedOn", { when: atText(t, locale, report.closedAt) })
                        : t(overdue ? "admin.reports.overdue" : "admin.reports.due", {
                            when: atText(t, locale, report.dueAt),
                          })}
                    </p>
                  </div>
                  {report.urgent || overdue || report.outcome !== null ? (
                    <p className="tags">
                      {report.urgent ? (
                        <span className="tag tag-warning type-small">
                          {t("admin.reports.urgent")}
                        </span>
                      ) : null}
                      {overdue ? (
                        <span className="tag tag-warning type-small">
                          {t("admin.reports.overdueTag")}
                        </span>
                      ) : null}
                      {report.outcome === null ? null : (
                        <span className="tag type-small">{t(outcomeKeys[report.outcome])}</span>
                      )}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
