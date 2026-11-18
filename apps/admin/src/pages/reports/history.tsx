import type { AdminModerationAction, AdminReportListItem } from "@shareride/contracts";
import { reportCategoryText } from "@shareride/i18n";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { actionLine, atText, outcomeKeys, reportsPath, subjectKeys } from "./texts.ts";

// What the console shows of a person's past, on a report's page and on
// their own page (spec 9, 3.4.2 and 3.5.2).

/** Reports by or about someone, each linking to its page. */
export function ReportLinks({ reports }: { readonly reports: readonly AdminReportListItem[] }) {
  const { t, locale } = useConsole();
  if (reports.length === 0) return <p className="type-body muted">{t("admin.reports.none")}</p>;
  return (
    <ul className="cards">
      {reports.map((one) => (
        <li key={one.id} className="card entry">
          <ConsoleLink to={`${reportsPath}/${one.id}`} className="type-label">
            {t("admin.reports.cardTitle", {
              subject: t(subjectKeys[one.subject]),
              category: reportCategoryText(t, one.category),
            })}
          </ConsoleLink>
          <p className="type-small muted">
            {`${t("admin.reports.filed", { when: atText(t, locale, one.filedAt) })} · `}
            {one.outcome === null ? t("admin.reports.open") : t(outcomeKeys[one.outcome])}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Actions on a person or a report, each with its reason and appeal. */
export function ActionList({ actions }: { readonly actions: readonly AdminModerationAction[] }) {
  const { t, locale } = useConsole();
  if (actions.length === 0) return <p className="type-body muted">{t("admin.reports.none")}</p>;
  return (
    <ul className="cards">
      {actions.map((action) => (
        <li key={action.id} className="card entry">
          <p className="type-label">{actionLine(t, locale, action)}</p>
          <p className="type-body">{t("admin.reports.reason", { reason: action.reason })}</p>
          {action.appeal === null ? null : (
            <p className="type-small muted">
              {action.appeal.outcome === null || action.appeal.answeredAt === null
                ? t("admin.reports.appealWaiting", {
                    when: atText(t, locale, action.appeal.sentAt),
                  })
                : t(`admin.reports.appealAnswered.${action.appeal.outcome}`, {
                    when: atText(t, locale, action.appeal.answeredAt),
                  })}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
