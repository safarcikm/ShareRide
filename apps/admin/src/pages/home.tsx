import { adminHomeRoute, type AdminHome } from "@shareride/contracts";
import type { MessageKey } from "@shareride/i18n";
import { useCallback, useEffect, useState } from "react";
import { ConsoleLink } from "../components/console-link.tsx";
import { useConsole } from "../console.tsx";
import { problemsPath } from "./meeting-points/problems.tsx";
import { settingName } from "./settings/texts.ts";

type Loaded = { state: "loading" } | { state: "failed" } | { state: "ready"; value: AdminHome };

interface Line {
  readonly text: MessageKey;
  readonly count: number;
  /** The list the count is of; none for what has no page yet. */
  readonly to: string | null;
}

/** What needs the operator today, most pressing first; a zero is left out (spec 10, 3.1.1). */
function linesOf(home: AdminHome): readonly Line[] {
  const lines: readonly Line[] = [
    { text: "admin.home.urgentReports", count: home.reports.urgent, to: "/admin/reports" },
    { text: "admin.home.reports", count: home.reports.other, to: "/admin/reports" },
    { text: "admin.home.appeals", count: home.appeals, to: "/admin/appeals" },
    { text: "admin.home.disputes", count: home.disputes, to: "/admin/disputes" },
    { text: "admin.home.meetingPointProblems", count: home.meetingPointProblems, to: problemsPath },
    {
      text: "admin.home.reviewsOverdue",
      count: home.meetingPointReviewsOverdue,
      to: "/admin/meeting-points?reviewOverdue=true",
    },
    { text: "admin.home.failedNotifications", count: home.failedNotifications, to: null },
    { text: "admin.home.watched", count: home.watched, to: "/admin/reliability" },
    { text: "admin.home.newFeedback", count: home.newFeedback, to: "/admin/feedback" },
  ];
  return lines.filter((line) => line.count > 0);
}

export function HomePage() {
  const { t, call, operator } = useConsole();
  const name = operator?.firstName ?? null;
  const [home, setHome] = useState<Loaded>({ state: "loading" });

  const load = useCallback(async () => {
    const result = await call(adminHomeRoute, {});
    setHome(result.ok ? { state: "ready", value: result.data } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="stack">
      <h1 className="type-title">
        {name === null ? t("admin.home.welcomeNoName") : t("admin.home.welcome", { name })}
      </h1>
      {home.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : home.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.home.failed")}
          </p>
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setHome({ state: "loading" });
              void load();
            }}
          >
            {t("admin.home.loadAgain")}
          </button>
        </div>
      ) : (
        <Today home={home.value} />
      )}
    </section>
  );
}

function Today({ home }: { readonly home: AdminHome }) {
  const { t } = useConsole();
  const lines = linesOf(home);
  return (
    <>
      <h2 className="type-heading">{t("admin.home.today")}</h2>
      {home.switchesOff.length === 0 ? null : (
        <p className="problem type-body">
          <ConsoleLink to="/admin/settings">
            {t("admin.home.switchesOff", {
              count: home.switchesOff.length,
              names: home.switchesOff.map((key) => settingName(t, key)).join(", "),
            })}
          </ConsoleLink>
        </p>
      )}
      {lines.length === 0 ? (
        <p className="type-body muted">{t("admin.home.nothing")}</p>
      ) : (
        <ul className="stack">
          {lines.map((line) => (
            <li key={line.text} className="type-body">
              {line.to === null ? (
                t(line.text, { count: line.count })
              ) : (
                <ConsoleLink to={line.to}>{t(line.text, { count: line.count })}</ConsoleLink>
              )}
            </li>
          ))}
        </ul>
      )}
      {home.placesLeft === null ? null : (
        <p className="type-body">
          <ConsoleLink to="/admin/invite-codes">
            {t("admin.home.placesLeft", { count: home.placesLeft })}
          </ConsoleLink>
        </p>
      )}
    </>
  );
}
