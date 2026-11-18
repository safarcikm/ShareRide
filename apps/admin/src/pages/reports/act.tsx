import {
  adminCancelTripRoute,
  adminCloseReportRoute,
  adminHideContentRoute,
  adminReinstateRoute,
  adminSuspendRoute,
  adminWarnRoute,
  type AdminReport,
} from "@shareride/contracts";
import {
  characterCount,
  checkStatement,
  defaultSafetySettings,
  moderationRules,
  reportOutcomes,
  type HideableContent,
  type ModerationRule,
  type ReportOutcome,
} from "@shareride/domain";
import { moderationRuleText } from "@shareride/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";
import {
  atText,
  hiddenKeys,
  outcomeKeys,
  personName,
  statementLines,
  type Statement,
} from "./texts.ts";

const maxLength = defaultSafetySettings.textMaxLength;

/** What the operator can do from a report to the person reported (3.4.3). */
type Choice =
  | { readonly kind: "warn" }
  | { readonly kind: "suspend" }
  | { readonly kind: "reinstate" }
  | { readonly kind: "hide"; readonly content: HideableContent; readonly id: string }
  | { readonly kind: "cancelTrip"; readonly tripId: string };

const choiceKey = (choice: Choice) =>
  choice.kind === "hide" ? `hide-${choice.content}` : choice.kind;

/** The actions this report allows, as the API would take them. */
function choicesOf(report: AdminReport): readonly Choice[] {
  const reported = report.reported;
  if (reported === null || reported.status === "deleted") return [];
  // Whether the person reported drives the trip, so its note and the trip are theirs.
  const drives = report.trip !== null && report.trip.driverId === reported.userId;
  return [
    { kind: "warn" },
    ...(report.message !== null && !report.message.removed
      ? [{ kind: "hide", content: "message", id: report.message.id } as const]
      : []),
    ...(drives && report.trip !== null && report.trip.note !== "" && !report.trip.noteHidden
      ? [{ kind: "hide", content: "trip_note", id: report.trip.id } as const]
      : []),
    ...(report.about !== null && !report.about.hidden
      ? [{ kind: "hide", content: "about", id: reported.userId } as const]
      : []),
    ...(reported.status === "active" ? [{ kind: "suspend" } as const] : []),
    // A suspension made by mistake, or one to end early (3.6.3).
    ...(reported.status === "suspended" ? [{ kind: "reinstate" } as const] : []),
    ...(drives && report.trip?.status === "published"
      ? [{ kind: "cancelTrip", tripId: report.trip.id } as const]
      : []),
  ];
}

/** Refusals the operator can act on, each with its own words. */
const refusals = [
  "already_suspended",
  "not_suspended",
  "already_hidden",
  "already_cancelled",
  "trip_not_cancellable",
  "not_found",
] as const;

const isRefusal = (code: string): code is (typeof refusals)[number] =>
  (refusals as readonly string[]).includes(code);

/** A form's problem, shown by its field. */
type Problem = "choose" | "rule" | "reasonMissing" | "reasonTooLong" | "untilMissing" | "untilPast";

/** What the last press of Send came to. */
type Said =
  | { readonly kind: "none" }
  | { readonly kind: "done"; readonly text: string }
  | { readonly kind: "refused"; readonly text: string };

/**
 * Act on the person reported (3.4.3): warn them, hide what they posted,
 * suspend them or cancel the trip they drive. Each asks for the rule and
 * the reason, and shows the notice as they will read it, in their language,
 * before it goes (R9.5).
 */
export function ActPanel({
  report,
  onActed,
}: {
  readonly report: AdminReport;
  /** The action went: load the report again, with it. */
  readonly onActed: () => void;
}) {
  const { t, locale, call } = useConsole();
  const choices = choicesOf(report);
  const [chosen, setChosen] = useState<string | null>(null);
  const [rule, setRule] = useState<ModerationRule | "">("");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [noEnd, setNoEnd] = useState(false);
  const [counts, setCounts] = useState(false);
  const [problems, setProblems] = useState<readonly Problem[]>([]);
  const [preview, setPreview] = useState<Statement | null>(null);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<Said>({ kind: "none" });
  const message = useRef<HTMLDivElement>(null);
  const sendButton = useRef<HTMLButtonElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const ruleField = useRef<HTMLSelectElement>(null);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const untilField = useRef<HTMLInputElement>(null);
  // Counts each press of "Review the notice" that found a problem.
  const [checks, setChecks] = useState(0);
  const ids = {
    heading: useId(),
    choice: useId(),
    choiceError: useId(),
    rule: useId(),
    ruleError: useId(),
    reason: useId(),
    reasonHint: useId(),
    reasonError: useId(),
    until: useId(),
    untilError: useId(),
    counts: useId(),
    preview: useId(),
    effect: useId(),
  };

  useEffect(() => {
    const shown = message.current?.firstElementChild;
    if (said.kind !== "none" && shown instanceof HTMLElement) shown.focus();
  }, [said]);

  useEffect(() => {
    if (preview !== null) sendButton.current?.focus();
  }, [preview]);

  // After a press of "Review the notice" that found a problem, the first
  // field with one takes the focus, and its problem is read out with it.
  useEffect(() => {
    if (checks === 0) return;
    const first = problems[0];
    const field =
      first === "choose"
        ? firstChoice.current
        : first === "rule"
          ? ruleField.current
          : first === "reasonMissing" || first === "reasonTooLong"
            ? reasonField.current
            : first === "untilMissing" || first === "untilPast"
              ? untilField.current
              : null;
    field?.focus();
    // Only on a press of "Review the notice", never as the operator types.
  }, [checks]);

  const reported = report.reported;
  const name = personName(t, reported);
  if (reported === null || choices.length === 0) {
    return (
      <section className="panel stack" aria-labelledby={ids.heading}>
        <h2 id={ids.heading} className="type-heading">
          {t("admin.reports.act")}
        </h2>
        <p className="type-body">{t("admin.reports.nobodyToActOn")}</p>
      </section>
    );
  }

  const choice = choices.find((one) => choiceKey(one) === chosen);
  const has = (problem: Problem) => problems.includes(problem);
  const labelOf = (one: Choice) =>
    one.kind === "hide"
      ? t("admin.reports.action.hide", { content: t(hiddenKeys[one.content]) })
      : t(`admin.reports.action.${one.kind}`, { name });
  const effectOf = (one: Choice) =>
    one.kind === "hide"
      ? t(`admin.reports.effect.hide.${one.content}`)
      : t(`admin.reports.effect.${one.kind}`);
  // A reinstatement has no rule, only a note the person reads (3.6.3).
  const needsRule = choice?.kind !== "reinstate";

  /** The day picked, as the moment the suspension ends: that day's start in Iceland (UTC). */
  const untilIso = until === "" ? null : `${until}T00:00:00.000Z`;

  function review() {
    const found: Problem[] = [];
    if (choice === undefined) found.push("choose");
    if (needsRule && rule === "") found.push("rule");
    const checked = checkStatement({ rule: rule === "" ? "other" : rule, reason });
    if (!checked.ok) {
      found.push(checked.error.code === "reason_missing" ? "reasonMissing" : "reasonTooLong");
    }
    if (choice?.kind === "suspend" && !noEnd) {
      if (untilIso === null) found.push("untilMissing");
      else if (Date.parse(untilIso) <= Date.now()) found.push("untilPast");
    }
    setProblems(found);
    setSaid({ kind: "none" });
    if (found.length > 0) setChecks((count) => count + 1);
    if (found.length > 0 || choice === undefined) return;
    setPreview({
      kind:
        choice.kind === "warn"
          ? "warning"
          : choice.kind === "suspend"
            ? "suspension"
            : choice.kind === "reinstate"
              ? "reinstatement"
              : choice.kind === "hide"
                ? "content_hidden"
                : "trip_cancelled",
      rule: !needsRule || rule === "" ? null : rule,
      reason: reason.trim(),
      content:
        choice.kind === "hide" ? choice.content : choice.kind === "cancelTrip" ? "trip" : null,
      until: choice.kind === "suspend" && !noEnd ? untilIso : null,
    });
  }

  /** Calls the action's route; on success, what to tell the operator. */
  async function perform(
    one: Choice,
    statement: Statement,
    person: { readonly userId: string },
  ): Promise<
    { readonly ok: true; readonly text: string } | { readonly ok: false; readonly code: string }
  > {
    if (one.kind === "reinstate") {
      const result = await call(adminReinstateRoute, {
        params: { id: person.userId },
        body: { note: statement.reason },
      });
      return result.ok
        ? { ok: true, text: t("admin.reports.doneReinstated", { name }) }
        : { ok: false, code: result.error.code };
    }
    if (statement.rule === null) return { ok: false, code: "validation_failed" };
    const body = { rule: statement.rule, reason: statement.reason, reportId: report.id };
    switch (one.kind) {
      case "suspend": {
        const result = await call(adminSuspendRoute, {
          params: { id: person.userId },
          body: { ...body, until: statement.until },
        });
        return result.ok
          ? {
              ok: true,
              text: t("admin.reports.doneSuspended", {
                name,
                trips: result.data.tripsCancelled,
                bookings: result.data.bookingsCancelled,
              }),
            }
          : { ok: false, code: result.error.code };
      }
      case "warn": {
        const result = await call(adminWarnRoute, { params: { id: person.userId }, body });
        return result.ok
          ? { ok: true, text: t("admin.reports.done", { name }) }
          : { ok: false, code: result.error.code };
      }
      case "hide": {
        const result = await call(adminHideContentRoute, {
          body: { ...body, content: { kind: one.content, id: one.id } },
        });
        return result.ok
          ? { ok: true, text: t("admin.reports.done", { name }) }
          : { ok: false, code: result.error.code };
      }
      case "cancelTrip": {
        const result = await call(adminCancelTripRoute, {
          params: { id: one.tripId },
          body: { ...body, countsOnReliability: counts },
        });
        return result.ok
          ? { ok: true, text: t("admin.reports.done", { name }) }
          : { ok: false, code: result.error.code };
      }
    }
  }

  async function send(statement: Statement) {
    if (choice === undefined || reported === null) return;
    setSaving(true);
    const result = await perform(choice, statement, reported);
    setSaving(false);
    setPreview(null);
    if (result.ok) {
      setChosen(null);
      setRule("");
      setReason("");
      setUntil("");
      setNoEnd(false);
      setCounts(false);
      setSaid({ kind: "done", text: result.text });
      onActed();
      return;
    }
    if (!isRefusal(result.code)) {
      setSaid({ kind: "refused", text: t("admin.reports.actFailed") });
      return;
    }
    // Someone acted meanwhile: the report, loaded again, shows how it is now.
    setChosen(null);
    setSaid({ kind: "refused", text: t(`admin.reports.refused.${result.code}`) });
    onActed();
  }

  return (
    <section className="panel stack" aria-labelledby={ids.heading}>
      <h2 id={ids.heading} className="type-heading">
        {t("admin.reports.act")}
      </h2>
      <p className="type-body muted">{t("admin.reports.actHint", { name })}</p>
      <div ref={message} className="message">
        {said.kind === "done" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {said.text}
          </p>
        ) : said.kind === "refused" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {said.text}
          </p>
        ) : null}
      </div>
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          review();
        }}
      >
        <p id={ids.choice} className="type-label">
          {t("admin.reports.action")}
        </p>
        <div
          className="outcomes"
          role="radiogroup"
          aria-labelledby={ids.choice}
          aria-invalid={has("choose")}
          aria-describedby={has("choose") ? ids.choiceError : undefined}
        >
          {choices.map((one, index) => {
            const key = choiceKey(one);
            return (
              <div key={key}>
                <label className="check type-body">
                  <input
                    ref={index === 0 ? firstChoice : undefined}
                    type="radio"
                    name={ids.choice}
                    value={key}
                    checked={chosen === key}
                    disabled={preview !== null}
                    aria-describedby={
                      has("choose")
                        ? `${ids.choiceError} ${ids.effect}-${key}`
                        : `${ids.effect}-${key}`
                    }
                    onChange={() => {
                      setChosen(key);
                      setProblems(problems.filter((problem) => problem !== "choose"));
                    }}
                  />
                  {labelOf(one)}
                </label>
                <p id={`${ids.effect}-${key}`} className="hint type-small">
                  {effectOf(one)}
                </p>
              </div>
            );
          })}
        </div>
        {has("choose") ? (
          <p id={ids.choiceError} className="field-error type-small">
            {t("admin.reports.chooseAction")}
          </p>
        ) : null}
        {needsRule ? (
          <div className="field">
            <label htmlFor={ids.rule} className="type-label">
              {t("admin.reports.rule")}
            </label>
            <select
              ref={ruleField}
              id={ids.rule}
              className="input type-body"
              value={rule}
              disabled={preview !== null}
              aria-invalid={has("rule")}
              aria-describedby={has("rule") ? ids.ruleError : undefined}
              onChange={(event) => {
                setRule(event.target.value as ModerationRule | "");
                setProblems(problems.filter((problem) => problem !== "rule"));
              }}
            >
              <option value="">{t("admin.reports.chooseRule")}</option>
              {moderationRules.map((one) => (
                <option key={one} value={one}>
                  {moderationRuleText(t, one)}
                </option>
              ))}
            </select>
            {has("rule") ? (
              <p id={ids.ruleError} className="field-error type-small">
                {t("admin.reports.ruleMissing")}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor={ids.reason} className="type-label">
            {t(needsRule ? "admin.reports.reasonLabel" : "admin.reports.noteLabel", { name })}
          </label>
          <textarea
            ref={reasonField}
            id={ids.reason}
            className="input textarea type-body"
            rows={4}
            value={reason}
            readOnly={preview !== null}
            aria-invalid={has("reasonMissing") || has("reasonTooLong")}
            aria-describedby={
              has("reasonMissing") || has("reasonTooLong")
                ? `${ids.reasonHint} ${ids.reasonError}`
                : ids.reasonHint
            }
            onChange={(event) => {
              setReason(event.target.value);
              setProblems(
                problems.filter(
                  (problem) => problem !== "reasonMissing" && problem !== "reasonTooLong",
                ),
              );
            }}
          />
          <p id={ids.reasonHint} className="hint type-small">
            {t("admin.reports.reasonHint", {
              count: characterCount(reason.trim()),
              max: maxLength,
            })}
          </p>
          {has("reasonMissing") || has("reasonTooLong") ? (
            <p id={ids.reasonError} className="field-error type-small">
              {t(
                has("reasonMissing")
                  ? "admin.reports.reasonMissing"
                  : "admin.reports.reasonTooLong",
                {
                  max: maxLength,
                },
              )}
            </p>
          ) : null}
        </div>
        {choice?.kind === "suspend" ? (
          <div className="field">
            <label htmlFor={ids.until} className="type-label">
              {t("admin.reports.until")}
            </label>
            <input
              ref={untilField}
              id={ids.until}
              type="date"
              className="input type-body"
              value={until}
              disabled={noEnd || preview !== null}
              aria-invalid={has("untilMissing") || has("untilPast")}
              aria-describedby={
                has("untilMissing") || has("untilPast") ? ids.untilError : undefined
              }
              onChange={(event) => {
                setUntil(event.target.value);
                setProblems(
                  problems.filter(
                    (problem) => problem !== "untilMissing" && problem !== "untilPast",
                  ),
                );
              }}
            />
            <label className="check type-body">
              <input
                type="checkbox"
                checked={noEnd}
                disabled={preview !== null}
                onChange={(event) => {
                  setNoEnd(event.target.checked);
                  setProblems(
                    problems.filter(
                      (problem) => problem !== "untilMissing" && problem !== "untilPast",
                    ),
                  );
                }}
              />
              {t("admin.reports.noEnd")}
            </label>
            {has("untilMissing") || has("untilPast") ? (
              <p id={ids.untilError} className="field-error type-small">
                {t(has("untilMissing") ? "admin.reports.untilMissing" : "admin.reports.untilPast")}
              </p>
            ) : null}
          </div>
        ) : null}
        {choice?.kind === "cancelTrip" ? (
          <div className="field">
            <label className="check type-body">
              <input
                id={ids.counts}
                type="checkbox"
                checked={counts}
                disabled={preview !== null}
                onChange={(event) => {
                  setCounts(event.target.checked);
                }}
              />
              {t("admin.reports.countsOnReliability")}
            </label>
            <p className="hint type-small">{t("admin.reports.countsHint")}</p>
          </div>
        ) : null}
        {preview === null ? (
          <button type="submit" className="button-primary type-button">
            {t("admin.reports.review")}
          </button>
        ) : (
          <div className="stack" role="group" aria-labelledby={ids.preview}>
            <h3 id={ids.preview} className="type-label">
              {t("admin.reports.previewHeading", {
                name,
                language: t(`admin.reports.language.${reported.locale}`),
              })}
            </h3>
            <div className="card stack">
              {statementLines(reported.locale, preview).map((line, index) => (
                <p key={index} className={index === 0 ? "type-heading" : "type-body"}>
                  {line}
                </p>
              ))}
            </div>
            {preview.until === null ? null : (
              <p className="type-small muted">
                {t("admin.reports.untilShown", { when: atText(t, locale, preview.until) })}
              </p>
            )}
            <div className="confirm-row">
              <button
                ref={sendButton}
                type="button"
                className="button-primary type-button"
                disabled={saving}
                onClick={() => void send(preview)}
              >
                {t("admin.reports.send")}
              </button>
              <button
                type="button"
                className="button-quiet type-label"
                disabled={saving}
                onClick={() => {
                  setPreview(null);
                }}
              >
                {t("admin.reports.goBack")}
              </button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}

/**
 * Close the report (3.1.6): the reporter is told the outcome in general
 * terms, never what was done. Asks once more, as it cannot be undone.
 */
export function ClosePanel({
  report,
  onClosed,
}: {
  readonly report: AdminReport;
  readonly onClosed: (report: AdminReport) => void;
}) {
  const { t, locale, call } = useConsole();
  // Once an action is taken on the report, closing it says so to the reporter.
  const acted = report.actions.length > 0;
  const [chosen, setChosen] = useState<ReportOutcome | null>(acted ? "action_taken" : null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<"none" | "choose" | "closed" | "alreadyClosed" | "failed">(
    "none",
  );
  const message = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const ids = { heading: useId(), outcome: useId(), effect: useId() };

  useEffect(() => {
    const shown = message.current?.firstElementChild;
    if (said !== "none" && shown instanceof HTMLElement) shown.focus();
  }, [said]);

  // An action taken here, with the panel open.
  useEffect(() => {
    if (acted) setChosen((was) => was ?? "action_taken");
  }, [acted]);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  async function close(outcome: ReportOutcome) {
    setSaving(true);
    const result = await call(adminCloseReportRoute, {
      params: { id: report.id },
      body: { outcome },
    });
    setSaving(false);
    setConfirming(false);
    if (result.ok) {
      setSaid("closed");
      onClosed(result.data);
    } else {
      setSaid(result.error.code === "already_closed" ? "alreadyClosed" : "failed");
    }
  }

  return (
    <section className="panel stack" aria-labelledby={ids.heading}>
      <h2 id={ids.heading} className="type-heading">
        {t("admin.reports.close")}
      </h2>
      <div ref={message} className="message">
        {said === "closed" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {t("admin.reports.closedNow")}
          </p>
        ) : said === "choose" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.reports.chooseOutcome")}
          </p>
        ) : said === "alreadyClosed" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.reports.alreadyClosed")}
          </p>
        ) : said === "failed" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.reports.closeFailed")}
          </p>
        ) : null}
      </div>
      {report.outcome !== null && report.closedAt !== null ? (
        <p className="type-body">
          {t("admin.reports.status.closed", {
            outcome: t(outcomeKeys[report.outcome]),
            when: atText(t, locale, report.closedAt),
          })}
        </p>
      ) : (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (chosen === null) setSaid("choose");
            else {
              setSaid("none");
              setConfirming(true);
            }
          }}
        >
          <p className="type-body muted">{t("admin.reports.closeHint")}</p>
          <p id={ids.outcome} className="type-label">
            {t("admin.reports.outcomeLabel")}
          </p>
          <div className="outcomes" role="radiogroup" aria-labelledby={ids.outcome}>
            {reportOutcomes.map((outcome) => (
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
                      if (said === "choose") setSaid("none");
                    }}
                  />
                  {t(outcomeKeys[outcome])}
                </label>
                <p id={`${ids.effect}-${outcome}`} className="hint type-small">
                  {t(`admin.reports.outcomeHint.${outcome}`)}
                </p>
              </div>
            ))}
          </div>
          {confirming && chosen !== null ? (
            <div className="confirm-row" role="group">
              <p className="type-body">
                {t("admin.reports.confirmClose", { outcome: t(outcomeKeys[chosen]) })}
              </p>
              <button
                ref={confirmButton}
                type="button"
                className="button-primary type-button"
                disabled={saving}
                onClick={() => void close(chosen)}
              >
                {t("admin.reports.confirmCloseYes")}
              </button>
              <button
                type="button"
                className="button-quiet type-label"
                disabled={saving}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                {t("admin.reports.goBack")}
              </button>
            </div>
          ) : (
            <button type="submit" className="button-primary type-button">
              {t("admin.reports.closeButton")}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
