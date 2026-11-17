import {
  adminReportConversationRoute,
  adminReportRoute,
  type AdminConversationMessage,
  type AdminModerationAction,
  type AdminReport,
} from "@shareride/contracts";
import { reportCategoryText } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { messageText } from "../disputes/texts.ts";
import { ActPanel, ClosePanel } from "./act.tsx";
import {
  actionLine,
  atText,
  bookingStatusKeys,
  outcomeKeys,
  personName,
  reportsPath,
  senderText,
  standingText,
  subjectKeys,
  tripStatusKeys,
} from "./texts.ts";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "missing" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly report: AdminReport };

/**
 * One report with what the system knows (spec 9, 3.4.2): the report, what
 * it is about, the actions taken on it, and both people's other reports,
 * recent trips and actions. A reported message's words are read in the
 * conversation, opened only when asked, as each opening is logged (R9.6).
 * The operator acts here and closes it.
 */
export function ReportDetail({ id }: { readonly id: string }) {
  const { t, locale, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  // Back to the list it was in when opened, so closing it here returns to the open ones.
  const [backTo, setBackTo] = useState(reportsPath);
  const opened = useRef<string | null>(null);
  const ids = { report: useId(), about: useId(), taken: useId() };

  const load = useCallback(async () => {
    const result = await call(adminReportRoute, { params: { id } });
    if (!result.ok) {
      setLoaded({ state: result.status === 404 ? "missing" : "failed" });
      return;
    }
    if (opened.current !== id) {
      opened.current = id;
      setBackTo(result.data.status === "closed" ? `${reportsPath}?state=closed` : reportsPath);
    }
    setLoaded({ state: "ready", report: result.data });
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
        <ConsoleLink to={reportsPath} className="type-label">
          {t("admin.reports.back")}
        </ConsoleLink>
        <p className="problem type-body" role="alert">
          {t(loaded.state === "missing" ? "admin.reports.notFound" : "admin.reports.loadOneFailed")}
        </p>
      </section>
    );
  }

  const { report } = loaded;
  const at = (time: string) => atText(t, locale, time);
  const show = (next: AdminReport) => {
    setLoaded({ state: "ready", report: next });
  };

  return (
    <section className="stack">
      <ConsoleLink to={backTo} className="type-label">
        {t("admin.reports.back")}
      </ConsoleLink>
      <h1 className="type-title">
        {t("admin.reports.cardTitle", {
          subject: t(subjectKeys[report.subject]),
          category: reportCategoryText(t, report.category),
        })}
      </h1>

      <section className="panel stack" aria-labelledby={ids.report}>
        <h2 id={ids.report} className="type-heading">
          {t("admin.reports.report")}
        </h2>
        <dl className="facts type-body">
          <dt>{t("admin.reports.reporter")}</dt>
          <dd>{personName(t, report.reporter)}</dd>
          <dt>{t("admin.reports.reported")}</dt>
          <dd>{personName(t, report.reported)}</dd>
          <dt>{t("admin.reports.filedLabel")}</dt>
          <dd>{at(report.filedAt)}</dd>
          <dt>{t("admin.reports.status")}</dt>
          <dd>
            {report.outcome === null || report.closedAt === null
              ? t("admin.reports.status.open", { when: at(report.dueAt) })
              : t("admin.reports.status.closed", {
                  outcome: t(outcomeKeys[report.outcome]),
                  when: at(report.closedAt),
                })}
          </dd>
          <dt>{t("admin.reports.description")}</dt>
          <dd>{report.description === "" ? t("admin.reports.none") : report.description}</dd>
        </dl>
        {report.urgent ? (
          <p className="tags">
            <span className="tag tag-warning type-small">{t("admin.reports.urgent")}</span>
          </p>
        ) : null}
      </section>

      <section className="panel stack" aria-labelledby={ids.about}>
        <h2 id={ids.about} className="type-heading">
          {t("admin.reports.records")}
        </h2>
        <dl className="facts type-body">
          {report.trip === null ? null : (
            <>
              <dt>{t("admin.reports.trip")}</dt>
              <dd>
                {t("admin.reports.route", {
                  from: report.trip.from.name[locale],
                  to: report.trip.to.name[locale],
                })}
                {report.trip.from.plannedAt === null
                  ? null
                  : ` · ${at(report.trip.from.plannedAt)}`}
                {` · ${t(tripStatusKeys[report.trip.status])}`}
              </dd>
              <dt>{t("admin.reports.tripNote")}</dt>
              <dd>
                {report.trip.note === "" ? t("admin.reports.none") : report.trip.note}
                {report.trip.noteHidden ? <HiddenTag /> : null}
              </dd>
            </>
          )}
          {report.booking === null ? null : (
            <>
              <dt>{t("admin.reports.booking")}</dt>
              <dd>
                {t("admin.reports.bookingFacts", {
                  status: t(bookingStatusKeys[report.booking.status]),
                  count: report.booking.seats,
                })}
              </dd>
            </>
          )}
          {report.message === null ? null : (
            <>
              <dt>{t("admin.reports.message")}</dt>
              <dd>
                {t("admin.reports.messageSent", { when: at(report.message.sentAt) })}
                {report.message.removed ? <HiddenTag /> : null}
              </dd>
            </>
          )}
          {report.about === null ? null : (
            <>
              <dt>{t("admin.reports.about")}</dt>
              <dd>
                {report.about.text}
                {report.about.hidden ? <HiddenTag /> : null}
              </dd>
            </>
          )}
        </dl>
        {report.trip === null &&
        report.booking === null &&
        report.message === null &&
        report.about === null ? (
          <p className="type-body">{t("admin.reports.recordsGone")}</p>
        ) : null}
      </section>

      {report.conversation ? <Conversation report={report} /> : null}

      <section className="panel stack" aria-labelledby={ids.taken}>
        <h2 id={ids.taken} className="type-heading">
          {t("admin.reports.actionsTaken")}
        </h2>
        <Actions actions={report.actions} />
      </section>

      <ActPanel report={report} onActed={() => void load()} />
      <ClosePanel report={report} onClosed={show} />

      {report.reportedSide === null ? null : (
        <Side heading={t("admin.reports.side.reported")} side={report.reportedSide} />
      )}
      {report.reporterSide === null ? null : (
        <Side heading={t("admin.reports.side.reporter")} side={report.reporterSide} />
      )}
    </section>
  );
}

function HiddenTag() {
  const { t } = useConsole();
  return (
    <span className="tags">
      <span className="tag tag-warning type-small">{t("admin.reports.hiddenTag")}</span>
    </span>
  );
}

/** Actions on a person or a report, each with its reason and appeal. */
function Actions({ actions }: { readonly actions: readonly AdminModerationAction[] }) {
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

/** What the console knows of one person on the report (3.4.2). */
function Side({
  heading,
  side,
}: {
  readonly heading: string;
  readonly side: NonNullable<AdminReport["reportedSide"]>;
}) {
  const { t, locale } = useConsole();
  const headingId = useId();
  const reportList = (
    reports: AdminReport["reportedSide"] extends infer S
      ? S extends { reportsBy: infer R }
        ? R
        : never
      : never,
  ) =>
    reports.length === 0 ? (
      <p className="type-body muted">{t("admin.reports.none")}</p>
    ) : (
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
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId} className="type-heading">
        {t("admin.reports.sideHeading", { side: heading, name: personName(t, side.person) })}
      </h2>
      <dl className="facts type-body">
        <dt>{t("admin.reports.standing")}</dt>
        <dd>{standingText(t, locale, side.person)}</dd>
        <dt>{t("admin.reports.language")}</dt>
        <dd>{t(`admin.reports.language.${side.person.locale}`)}</dd>
      </dl>
      <h3 className="type-label">{t("admin.reports.reportsAbout")}</h3>
      {reportList(side.reportsAbout)}
      <h3 className="type-label">{t("admin.reports.reportsBy")}</h3>
      {reportList(side.reportsBy)}
      <h3 className="type-label">{t("admin.reports.personActions")}</h3>
      <Actions actions={side.actions} />
      <h3 className="type-label">{t("admin.reports.recentTrips")}</h3>
      {side.recentTrips.length === 0 ? (
        <p className="type-body muted">{t("admin.reports.none")}</p>
      ) : (
        <ul className="cards">
          {side.recentTrips.map((trip) => (
            <li key={`${trip.tripId}-${trip.role}`} className="card entry">
              <p className="type-body">
                {t(`admin.reports.tripRole.${trip.role}`, {
                  from: trip.from.name[locale],
                  to: trip.to.name[locale],
                })}
              </p>
              <p className="type-small muted">
                {trip.from.plannedAt === null
                  ? null
                  : `${atText(t, locale, trip.from.plannedAt)} · `}
                {t(tripStatusKeys[trip.status])}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Reading =
  | { readonly state: "closed" }
  | { readonly state: "loading" }
  | { readonly state: "shown"; readonly messages: readonly AdminConversationMessage[] }
  | { readonly state: "failed" };

/**
 * The conversation a message report covers, opened only when the operator
 * asks, as each opening goes in the audit log (R9.6). The reported message
 * is marked, and one ShareRide removed shows its words, marked removed.
 */
function Conversation({ report }: { readonly report: AdminReport }) {
  const { t, locale, call } = useConsole();
  const [reading, setReading] = useState<Reading>({ state: "closed" });
  const result = useRef<HTMLDivElement>(null);
  const heading = useId();
  const names = {
    driver: t("admin.reports.from.driver"),
    passenger: t("admin.reports.from.passenger"),
  };

  useEffect(() => {
    const shown = result.current?.firstElementChild;
    if ((reading.state === "shown" || reading.state === "failed") && shown instanceof HTMLElement) {
      shown.focus();
    }
  }, [reading.state]);

  async function open() {
    setReading({ state: "loading" });
    const answer = await call(adminReportConversationRoute, { params: { id: report.id } });
    setReading(
      answer.ok ? { state: "shown", messages: answer.data.messages } : { state: "failed" },
    );
  }

  return (
    <section className="panel stack" aria-labelledby={heading}>
      <h2 id={heading} className="type-heading">
        {t("admin.reports.conversation")}
      </h2>
      <p className="type-body muted">{t("admin.reports.conversationHint")}</p>
      <div ref={result} className="message">
        {reading.state === "shown" ? (
          <p className="type-body" tabIndex={-1}>
            {reading.messages.length === 0
              ? t("admin.reports.noMessages")
              : t("admin.reports.messageCount", { count: reading.messages.length })}
          </p>
        ) : reading.state === "failed" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.reports.conversationFailed")}
          </p>
        ) : null}
      </div>
      {reading.state === "shown" && reading.messages.length > 0 ? (
        <ul className="cards" aria-labelledby={heading}>
          {reading.messages.map((one) => (
            <li key={one.id} className="card entry">
              <p className="tags">
                <span className="type-label">{senderText(t, one.from)}</span>
                <time className="type-small muted" dateTime={one.sentAt}>
                  {atText(t, locale, one.sentAt)}
                </time>
                {one.id === report.message?.id ? (
                  <span className="tag tag-warning type-small">
                    {t("admin.reports.reportedTag")}
                  </span>
                ) : null}
                {one.removed ? (
                  <span className="tag tag-warning type-small">{t("admin.reports.hiddenTag")}</span>
                ) : null}
              </p>
              <p className="type-body">{messageText(t, locale, one, names)}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {reading.state === "closed" || reading.state === "loading" || reading.state === "failed" ? (
        <button
          type="button"
          className="button-secondary type-label"
          disabled={reading.state === "loading"}
          onClick={() => void open()}
        >
          {t("admin.reports.showConversation")}
        </button>
      ) : null}
    </section>
  );
}
