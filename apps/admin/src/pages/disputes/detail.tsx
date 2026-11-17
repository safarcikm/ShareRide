import {
  adminDecideDisputeRoute,
  adminDisputeConversationRoute,
  adminDisputeRoute,
  type AdminConversationMessage,
  type AdminDispute,
} from "@shareride/contracts";
import {
  answererOf,
  checkDisputeNote,
  operatorMayRead,
  reporterOf,
  type DisputeOutcome,
} from "@shareride/domain";
import { formatClock } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import {
  atText,
  disputesPath,
  kindKeys,
  messageText,
  nameOf,
  outcomeTexts,
  senderText,
} from "./texts.ts";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "missing" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly report: AdminDispute };

/** What the last press of Decide came to. */
type Said =
  | { readonly kind: "none" }
  | { readonly kind: "choose" }
  | { readonly kind: "tooLong" }
  | { readonly kind: "decided"; readonly outcome: DisputeOutcome }
  | { readonly kind: "alreadyDecided" }
  | { readonly kind: "notWaiting" }
  /** The report could not be loaded again after one of the two above. */
  | { readonly kind: "reloadFailed" }
  | { readonly kind: "failed" };

/**
 * One contested report with what the system knows (spec 8, 3.5): both
 * sides' notes and the answer, every stop's planned time and the driver's
 * "I'm here" there, the passenger's, and the decision, made here once and
 * final in the app. The booking's conversation opens only when asked, as
 * each opening is logged (R9.6).
 */
export function DisputeDetail({ id }: { readonly id: string }) {
  const { t, locale, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [chosen, setChosen] = useState<DisputeOutcome | null>(null);
  const [reasons, setReasons] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [said, setSaid] = useState<Said>({ kind: "none" });
  const message = useRef<HTMLDivElement>(null);
  const decideButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const decisionHeading = useRef<HTMLHeadingElement>(null);
  // Where focus goes once the next change shows: back to Decide, or to the decision.
  const focusNext = useRef<"decide" | "decision" | null>(null);
  const ids = {
    booking: useId(),
    said: useId(),
    report: useId(),
    answer: useId(),
    stops: useId(),
    decision: useId(),
    outcome: useId(),
    reasons: useId(),
    reasonsHint: useId(),
    reasonsError: useId(),
    chooseError: useId(),
    effect: useId(),
  };

  const load = useCallback(async () => {
    const result = await call(adminDisputeRoute, { params: { id } });
    if (result.ok) setLoaded({ state: "ready", report: result.data });
    else setLoaded({ state: result.status === 404 ? "missing" : "failed" });
  }, [call, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // A result or a problem takes the focus, so it is read at once.
  useEffect(() => {
    const shown = message.current?.firstElementChild;
    if (said.kind !== "none" && shown instanceof HTMLElement) shown.focus();
  }, [said]);

  useEffect(() => {
    if (confirming) {
      confirmButton.current?.focus();
    } else if (focusNext.current === "decide") {
      focusNext.current = null;
      decideButton.current?.focus();
    }
  }, [confirming]);

  useEffect(() => {
    if (loaded.state === "ready" && focusNext.current === "decision") {
      focusNext.current = null;
      decisionHeading.current?.focus();
    }
  }, [loaded]);

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
        <ConsoleLink to={disputesPath} className="type-label">
          {t("admin.disputes.back")}
        </ConsoleLink>
        <p className="problem type-body" role="alert">
          {t(
            loaded.state === "missing" ? "admin.disputes.notFound" : "admin.disputes.loadOneFailed",
          )}
        </p>
      </section>
    );
  }

  const { report } = loaded;
  const reporter = reporterOf(report.kind);
  const answerer = answererOf(report.kind);
  const at = (time: string) => atText(t, locale, time);
  const clock = (time: string | null) =>
    time === null ? null : <time dateTime={time}>{formatClock(new Date(time))}</time>;
  const labelOf = (outcome: DisputeOutcome) => t(outcomeTexts(report.kind, outcome).label);
  const tooLong = said.kind === "tooLong";

  function ask() {
    if (chosen === null) {
      setSaid({ kind: "choose" });
      return;
    }
    // As the API checks it, so a long note is caught before the question.
    if (!checkDisputeNote(reasons).ok) {
      setSaid({ kind: "tooLong" });
      return;
    }
    setSaid({ kind: "none" });
    setConfirming(true);
  }

  async function decide(outcome: DisputeOutcome) {
    setSaving(true);
    const result = await call(adminDecideDisputeRoute, {
      params: { id: report.id },
      body: { outcome, note: reasons.trim() },
    });
    setSaving(false);
    setConfirming(false);
    if (result.ok) {
      setLoaded({ state: "ready", report: result.data });
      setSaid({ kind: "decided", outcome });
      return;
    }
    const { code, details } = result.error;
    if (code === "validation_failed" && details?.some((detail) => detail.path === "note")) {
      setSaid({ kind: "tooLong" });
    } else if (code === "already_decided") {
      setSaid({ kind: "alreadyDecided" });
    } else if (code === "not_contested" || code === "outcome_invalid") {
      setSaid({ kind: "notWaiting" });
    } else {
      setSaid({ kind: "failed" });
    }
  }

  /** The report as it is now, after someone else decided or changed it. */
  async function reload() {
    setReloading(true);
    const result = await call(adminDisputeRoute, { params: { id: report.id } });
    setReloading(false);
    if (!result.ok) {
      setSaid({ kind: "reloadFailed" });
      return;
    }
    focusNext.current = "decision";
    setChosen(null);
    setSaid({ kind: "none" });
    setLoaded({ state: "ready", report: result.data });
  }

  const reloadButton = (
    <button
      type="button"
      className="button-secondary type-label"
      disabled={reloading}
      onClick={() => void reload()}
    >
      {t("admin.disputes.reload")}
    </button>
  );

  return (
    <section className="stack">
      <ConsoleLink
        to={report.decidedBy === "operator" ? `${disputesPath}?state=decided` : disputesPath}
        className="type-label"
      >
        {t("admin.disputes.back")}
      </ConsoleLink>
      <h1 className="type-title">{t(kindKeys[report.kind])}</h1>

      <section className="panel stack" aria-labelledby={ids.booking}>
        <h2 id={ids.booking} className="type-heading">
          {t("admin.disputes.booking")}
        </h2>
        <dl className="facts type-body">
          <dt>{t("admin.disputes.driver")}</dt>
          <dd>{nameOf(t, report.driver)}</dd>
          <dt>{t("admin.disputes.passenger")}</dt>
          <dd>{nameOf(t, report.passenger)}</dd>
          <dt>{t("admin.disputes.seats")}</dt>
          <dd>{report.seats}</dd>
          <dt>{t("admin.disputes.ride")}</dt>
          <dd>{`${report.from.name[locale]} – ${report.to.name[locale]}`}</dd>
          <dt>{t("admin.disputes.state")}</dt>
          <dd>
            {report.outcome !== null
              ? t("admin.disputes.state.decided")
              : report.answer === "contested"
                ? t("admin.disputes.state.waiting")
                : t("admin.disputes.state.open", { when: at(report.answerBy) })}
          </dd>
        </dl>
      </section>

      <section className="panel stack" aria-labelledby={ids.said}>
        <h2 id={ids.said} className="type-heading">
          {t("admin.disputes.said")}
        </h2>
        <div className="card-text" role="group" aria-labelledby={ids.report}>
          <h3 id={ids.report} className="type-label">
            {t(`admin.disputes.reportBy.${reporter}`)}
          </h3>
          <dl className="facts type-body">
            <dt>{t("admin.disputes.when")}</dt>
            <dd>{at(report.raisedAt)}</dd>
            <dt>{t("admin.disputes.note")}</dt>
            <dd>{report.note === "" ? t("admin.disputes.none") : report.note}</dd>
          </dl>
        </div>
        <div className="card-text" role="group" aria-labelledby={ids.answer}>
          <h3 id={ids.answer} className="type-label">
            {t(`admin.disputes.answerBy.${answerer}`)}
          </h3>
          {report.answer === null ? (
            <p className="type-body">
              {t(
                Date.now() < Date.parse(report.answerBy)
                  ? "admin.disputes.noAnswerYet"
                  : "admin.disputes.noAnswer",
                { when: at(report.answerBy) },
              )}
            </p>
          ) : (
            <dl className="facts type-body">
              <dt>{t("admin.disputes.answer")}</dt>
              <dd>{t(`admin.disputes.answer.${report.answer}`)}</dd>
              {report.answeredAt === null ? null : (
                <>
                  <dt>{t("admin.disputes.when")}</dt>
                  <dd>{at(report.answeredAt)}</dd>
                </>
              )}
              <dt>{t("admin.disputes.note")}</dt>
              <dd>{report.answerNote === "" ? t("admin.disputes.none") : report.answerNote}</dd>
            </dl>
          )}
        </div>
      </section>

      <section className="panel stack" aria-labelledby={ids.stops}>
        <h2 id={ids.stops} className="type-heading">
          {t("admin.disputes.stops")}
        </h2>
        <table className="changes stops type-body" aria-labelledby={ids.stops}>
          <thead>
            <tr>
              <th scope="col">{t("admin.disputes.stop")}</th>
              <th scope="col">{t("admin.disputes.planned")}</th>
              <th scope="col">{t("admin.disputes.driverHere")}</th>
            </tr>
          </thead>
          <tbody>
            {report.stops.map((stop, index) => (
              <tr key={index}>
                <th scope="row">
                  {stop.name[locale]}
                  {stop.boards || stop.alights ? (
                    <span className="tags">
                      <span className="tag type-small">
                        {t(stop.boards ? "admin.disputes.boards" : "admin.disputes.alights")}
                      </span>
                    </span>
                  ) : null}
                </th>
                <td>{clock(stop.plannedAt) ?? t("admin.disputes.noTime")}</td>
                <td>{clock(stop.driverHereAt) ?? t("admin.disputes.notSaid")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="type-body">
          {report.passengerHereAt === null
            ? t("admin.disputes.passengerNotHere")
            : t("admin.disputes.passengerHere", {
                time: formatClock(new Date(report.passengerHereAt)),
              })}
        </p>
      </section>

      <Conversation report={report} />

      <section className="panel stack" aria-labelledby={ids.decision}>
        <h2 ref={decisionHeading} id={ids.decision} className="type-heading" tabIndex={-1}>
          {t("admin.disputes.decision")}
        </h2>
        <div ref={message} className="message">
          {said.kind === "decided" ? (
            <p className="notice type-body" role="status" tabIndex={-1}>
              {t("admin.disputes.decidedNow", { outcome: labelOf(said.outcome) })}
            </p>
          ) : said.kind === "choose" ? (
            <p id={ids.chooseError} className="problem type-body" role="alert" tabIndex={-1}>
              {t("admin.disputes.chooseOutcome")}
            </p>
          ) : said.kind === "tooLong" ? (
            <p className="problem type-body" role="alert" tabIndex={-1}>
              {t("admin.disputes.reasonsTooLong")}
            </p>
          ) : said.kind === "alreadyDecided" ||
            said.kind === "notWaiting" ||
            said.kind === "reloadFailed" ? (
            <div className="problem stack" role="alert" tabIndex={-1}>
              <p className="type-body">
                {t(
                  said.kind === "alreadyDecided"
                    ? "admin.disputes.alreadyDecided"
                    : said.kind === "notWaiting"
                      ? "admin.disputes.notWaiting"
                      : "admin.disputes.loadOneFailed",
                )}
              </p>
              {reloadButton}
            </div>
          ) : said.kind === "failed" ? (
            <p className="problem type-body" role="alert" tabIndex={-1}>
              {t("admin.disputes.decideFailed")}
            </p>
          ) : null}
        </div>
        {report.outcome !== null ? (
          <dl className="facts type-body">
            <dt>{t("admin.disputes.outcomeLabel")}</dt>
            <dd>{labelOf(report.outcome)}</dd>
            {report.decidedBy === null ? null : (
              <>
                <dt>{t("admin.disputes.decidedBy")}</dt>
                <dd>{t(`admin.disputes.decidedBy.${report.decidedBy}`)}</dd>
              </>
            )}
            {report.decidedAt === null ? null : (
              <>
                <dt>{t("admin.disputes.when")}</dt>
                <dd>{at(report.decidedAt)}</dd>
              </>
            )}
            {report.decidedBy === "operator" ? (
              <>
                <dt>{t("admin.disputes.reasonsLabel")}</dt>
                <dd>
                  {report.decisionNote === "" ? t("admin.disputes.none") : report.decisionNote}
                </dd>
              </>
            ) : null}
          </dl>
        ) : report.outcomes.length === 0 ? (
          <p className="type-body">{t("admin.disputes.notDecidable")}</p>
        ) : (
          <form
            className="stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <p className="type-body muted">{t("admin.disputes.decisionHint")}</p>
            <p id={ids.outcome} className="type-label">
              {t("admin.disputes.outcome")}
            </p>
            <div
              className="outcomes"
              role="radiogroup"
              aria-labelledby={ids.outcome}
              aria-invalid={said.kind === "choose"}
              aria-describedby={said.kind === "choose" ? ids.chooseError : undefined}
            >
              {report.outcomes.map((outcome) => (
                <div key={outcome}>
                  <label className="check type-body">
                    <input
                      type="radio"
                      name={ids.outcome}
                      value={outcome}
                      checked={chosen === outcome}
                      disabled={confirming}
                      aria-describedby={`${ids.effect}-${outcome}`}
                      onChange={() => {
                        setChosen(outcome);
                        if (said.kind === "choose") setSaid({ kind: "none" });
                      }}
                    />
                    {labelOf(outcome)}
                  </label>
                  <p id={`${ids.effect}-${outcome}`} className="hint type-small">
                    {t(outcomeTexts(report.kind, outcome).effect)}
                  </p>
                </div>
              ))}
            </div>
            <div className="field">
              <label htmlFor={ids.reasons} className="type-label">
                {t("admin.disputes.reasons")}
              </label>
              <textarea
                id={ids.reasons}
                className="input textarea type-body"
                rows={3}
                value={reasons}
                readOnly={confirming}
                aria-invalid={tooLong}
                aria-describedby={
                  tooLong ? `${ids.reasonsHint} ${ids.reasonsError}` : ids.reasonsHint
                }
                onChange={(event) => {
                  setReasons(event.target.value);
                  if (tooLong) setSaid({ kind: "none" });
                }}
              />
              <p id={ids.reasonsHint} className="hint type-small">
                {t("admin.disputes.reasonsHint")}
              </p>
              {tooLong ? (
                <p id={ids.reasonsError} className="field-error type-small">
                  {t("admin.disputes.reasonsTooLong")}
                </p>
              ) : null}
            </div>
            {confirming && chosen !== null ? (
              <div
                className="confirm-row"
                role="group"
                aria-label={t("admin.disputes.confirmQuestion", { outcome: labelOf(chosen) })}
              >
                <p className="type-body">
                  {t("admin.disputes.confirmQuestion", { outcome: labelOf(chosen) })}
                </p>
                <button
                  ref={confirmButton}
                  type="button"
                  className="button-primary type-button"
                  disabled={saving}
                  onClick={() => void decide(chosen)}
                >
                  {t("admin.disputes.confirm")}
                </button>
                <button
                  type="button"
                  className="button-quiet type-label"
                  disabled={saving}
                  onClick={() => {
                    focusNext.current = "decide";
                    setConfirming(false);
                  }}
                >
                  {t("admin.disputes.goBack")}
                </button>
              </div>
            ) : (
              <button ref={decideButton} type="submit" className="button-primary type-button">
                {t("admin.disputes.decide")}
              </button>
            )}
          </form>
        )}
      </section>
    </section>
  );
}

type Reading =
  | { readonly state: "closed" }
  | { readonly state: "loading" }
  | { readonly state: "shown"; readonly messages: readonly AdminConversationMessage[] }
  | { readonly state: "notCovered" }
  | { readonly state: "failed" };

/**
 * The booking's conversation, opened only when the operator asks, as each
 * opening goes in the audit log (R9.6), and only for a contested report
 * (R7.3, `operatorMayRead`).
 */
function Conversation({ report }: { readonly report: AdminDispute }) {
  const { t, locale, call } = useConsole();
  const [reading, setReading] = useState<Reading>({ state: "closed" });
  const result = useRef<HTMLDivElement>(null);
  const heading = useId();
  const names = { driver: nameOf(t, report.driver), passenger: nameOf(t, report.passenger) };

  useEffect(() => {
    const shown = result.current?.firstElementChild;
    if (
      (reading.state === "shown" || reading.state === "notCovered" || reading.state === "failed") &&
      shown instanceof HTMLElement
    ) {
      shown.focus();
    }
  }, [reading.state]);

  async function open() {
    setReading({ state: "loading" });
    const answer = await call(adminDisputeConversationRoute, { params: { id: report.id } });
    if (answer.ok) setReading({ state: "shown", messages: answer.data.messages });
    else if (answer.status === 409) setReading({ state: "notCovered" });
    else setReading({ state: "failed" });
  }

  // As the API rules it, so a reading it would refuse is not asked for.
  if (!operatorMayRead(report)) {
    return (
      <section className="panel stack" aria-labelledby={heading}>
        <h2 id={heading} className="type-heading">
          {t("admin.disputes.conversation")}
        </h2>
        <p className="type-body">{t("admin.disputes.conversationClosed")}</p>
      </section>
    );
  }

  return (
    <section className="panel stack" aria-labelledby={heading}>
      <h2 id={heading} className="type-heading">
        {t("admin.disputes.conversation")}
      </h2>
      <p className="type-body muted">{t("admin.disputes.conversationHint")}</p>
      <div ref={result} className="message">
        {reading.state === "shown" ? (
          <p className="type-body" tabIndex={-1}>
            {reading.messages.length === 0
              ? t("admin.disputes.noMessages")
              : t("admin.disputes.messageCount", { count: reading.messages.length })}
          </p>
        ) : reading.state === "notCovered" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.disputes.conversationClosed")}
          </p>
        ) : reading.state === "failed" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.disputes.conversationFailed")}
          </p>
        ) : null}
      </div>
      {reading.state === "shown" && reading.messages.length > 0 ? (
        <ul className="cards" aria-labelledby={heading}>
          {reading.messages.map((one) => (
            <li key={one.id} className="card entry">
              <p className="tags">
                <span className="type-label">{senderText(t, one.from, names)}</span>
                <time className="type-small muted" dateTime={one.sentAt}>
                  {atText(t, locale, one.sentAt)}
                </time>
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
          {t("admin.disputes.showConversation")}
        </button>
      ) : null}
    </section>
  );
}
