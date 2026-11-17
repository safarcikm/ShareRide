import {
  adminAnswerAppealRoute,
  adminAppealsRoute,
  type AdminModerationAction,
} from "@shareride/contracts";
import {
  appealOutcomes,
  characterCount,
  checkStatement,
  defaultSafetySettings,
  type AppealOutcome,
} from "@shareride/domain";
import { moderatedContentName } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import {
  actionKindKeys,
  actionLine,
  appealsPath,
  atText,
  personName,
  reportsPath,
} from "../reports/texts.ts";

const maxLength = defaultSafetySettings.textMaxLength;

type View = "open" | "answered";

const viewFromAddress = (): View =>
  new URLSearchParams(window.location.search).get("state") === "answered" ? "answered" : "open";

type List =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly appeals: readonly AdminModerationAction[] };

/**
 * The appeals of ShareRide's actions (spec 9, 3.4.4): those waiting, oldest
 * first, each answered here once and finally; or the last ones answered.
 */
export function AppealsPage() {
  const { t, call } = useConsole();
  const [view] = useState(viewFromAddress);
  const [list, setList] = useState<List>({ state: "loading" });
  const ids = { list: useId() };

  const load = useCallback(async () => {
    setList({ state: "loading" });
    const result = await call(adminAppealsRoute, { query: { state: view } });
    setList(result.ok ? { state: "ready", appeals: result.data.appeals } : { state: "failed" });
  }, [call, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = view === "open";

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.appeals.title")}</h1>
      <p className="type-body muted">{t("admin.appeals.intro")}</p>
      <nav className="views" aria-label={t("admin.appeals.views")}>
        <ConsoleLink
          to={appealsPath}
          current={open}
          className="button-secondary link-button type-label"
        >
          {t("admin.appeals.open")}
        </ConsoleLink>
        <ConsoleLink
          to={`${appealsPath}?state=answered`}
          current={!open}
          className="button-secondary link-button type-label"
        >
          {t("admin.appeals.answered")}
        </ConsoleLink>
      </nav>
      <h2 id={ids.list} className="type-heading">
        {t(open ? "admin.appeals.openHeading" : "admin.appeals.answeredHeading")}
      </h2>
      {list.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.appeals.loadFailed")}
          </p>
          <button type="button" className="button-secondary type-label" onClick={() => void load()}>
            {t("admin.retry")}
          </button>
        </div>
      ) : list.appeals.length === 0 ? (
        <p className="type-body muted">
          {t(open ? "admin.appeals.noneOpen" : "admin.appeals.noneAnswered")}
        </p>
      ) : (
        <>
          <p className="type-body" role="status">
            {t(open ? "admin.appeals.openCount" : "admin.appeals.answeredCount", {
              count: list.appeals.length,
            })}
          </p>
          <ul className="cards" aria-labelledby={ids.list}>
            {list.appeals.map((action) => (
              <li key={action.id} className="card">
                <Appeal
                  action={action}
                  onAnswered={(answered) => {
                    setList({
                      state: "ready",
                      appeals: list.appeals.map((one) => (one.id === answered.id ? answered : one)),
                    });
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

type Said =
  "none" | "choose" | "answerMissing" | "answerTooLong" | "sent" | "alreadyAnswered" | "failed";

/** One appealed action: what was done and why, the appeal, and the answer. */
function Appeal({
  action,
  onAnswered,
}: {
  readonly action: AdminModerationAction;
  readonly onAnswered: (action: AdminModerationAction) => void;
}) {
  const { t, locale, call } = useConsole();
  const [chosen, setChosen] = useState<AppealOutcome | null>(null);
  const [answer, setAnswer] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<Said>("none");
  const message = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const ids = {
    heading: useId(),
    outcome: useId(),
    effect: useId(),
    answer: useId(),
    answerHint: useId(),
    answerError: useId(),
  };
  const name = personName(t, action.person);
  const { appeal } = action;

  useEffect(() => {
    const shown = message.current?.firstElementChild;
    if (said !== "none" && shown instanceof HTMLElement) shown.focus();
  }, [said]);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  if (appeal === null) return null;

  /** What reversing it does, as the API does it. */
  const reversedEffect =
    action.kind === "suspension"
      ? "admin.appeals.effect.reversed.suspension"
      : action.kind === "content_hidden"
        ? "admin.appeals.effect.reversed.content_hidden"
        : "admin.appeals.effect.reversed.other";

  function ask() {
    if (chosen === null) {
      setSaid("choose");
      return;
    }
    const checked = checkStatement({ rule: "other", reason: answer });
    if (!checked.ok) {
      setSaid(checked.error.code === "reason_missing" ? "answerMissing" : "answerTooLong");
      return;
    }
    setSaid("none");
    setConfirming(true);
  }

  async function send(outcome: AppealOutcome) {
    setSaving(true);
    const result = await call(adminAnswerAppealRoute, {
      params: { id: action.id },
      body: { outcome, answer: answer.trim() },
    });
    setSaving(false);
    setConfirming(false);
    if (result.ok) {
      setSaid("sent");
      onAnswered(result.data);
    } else {
      setSaid(result.error.code === "already_answered" ? "alreadyAnswered" : "failed");
    }
  }

  const answerProblem = said === "answerMissing" || said === "answerTooLong";

  return (
    <div className="stack" role="group" aria-labelledby={ids.heading}>
      <h3 id={ids.heading} className="type-heading">
        {t("admin.appeals.cardTitle", { kind: t(actionKindKeys[action.kind]), name })}
      </h3>
      <p className="type-small muted">{actionLine(t, locale, action)}</p>
      <p className="type-body">{t("admin.reports.reason", { reason: action.reason })}</p>
      {action.content === null ? null : (
        <p className="type-body">
          {t("admin.appeals.concerns", { content: moderatedContentName(t, action.content.kind) })}
        </p>
      )}
      {action.reportId === null ? null : (
        <ConsoleLink to={`${reportsPath}/${action.reportId}`} className="type-label">
          {t("admin.appeals.openReport")}
        </ConsoleLink>
      )}
      <p className="type-label">
        {t("admin.appeals.appeal", { name, when: atText(t, locale, appeal.sentAt) })}
      </p>
      <p className="type-body">{appeal.text}</p>
      <div ref={message} className="message">
        {said === "sent" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {t("admin.appeals.sent", { name })}
          </p>
        ) : said === "choose" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.appeals.chooseOutcome")}
          </p>
        ) : said === "alreadyAnswered" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.appeals.alreadyAnswered")}
          </p>
        ) : said === "failed" ? (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t("admin.appeals.failed")}
          </p>
        ) : null}
      </div>
      {appeal.outcome !== null && appeal.answeredAt !== null ? (
        <>
          <p className="type-label">
            {t(`admin.appeals.answeredAs.${appeal.outcome}`, {
              when: atText(t, locale, appeal.answeredAt),
            })}
          </p>
          <p className="type-body">{appeal.answer}</p>
        </>
      ) : (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            ask();
          }}
        >
          <p id={ids.outcome} className="type-label">
            {t("admin.appeals.decision")}
          </p>
          <div
            className="outcomes"
            role="radiogroup"
            aria-labelledby={ids.outcome}
            aria-invalid={said === "choose"}
          >
            {appealOutcomes.map((outcome) => (
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
                  {t(`admin.appeals.outcome.${outcome}`)}
                </label>
                <p id={`${ids.effect}-${outcome}`} className="hint type-small">
                  {t(outcome === "upheld" ? "admin.appeals.effect.upheld" : reversedEffect)}
                </p>
              </div>
            ))}
          </div>
          <div className="field">
            <label htmlFor={ids.answer} className="type-label">
              {t("admin.appeals.answerLabel", { name })}
            </label>
            <textarea
              id={ids.answer}
              className="input textarea type-body"
              rows={3}
              value={answer}
              readOnly={confirming}
              aria-invalid={answerProblem}
              aria-describedby={
                answerProblem ? `${ids.answerHint} ${ids.answerError}` : ids.answerHint
              }
              onChange={(event) => {
                setAnswer(event.target.value);
                if (answerProblem) setSaid("none");
              }}
            />
            <p id={ids.answerHint} className="hint type-small">
              {t("admin.appeals.answerHint", {
                count: characterCount(answer.trim()),
                max: maxLength,
              })}
            </p>
            {answerProblem ? (
              <p id={ids.answerError} className="field-error type-small">
                {t(
                  said === "answerMissing"
                    ? "admin.appeals.answerMissing"
                    : "admin.appeals.answerTooLong",
                  {
                    max: maxLength,
                  },
                )}
              </p>
            ) : null}
          </div>
          {confirming && chosen !== null ? (
            <div className="confirm-row" role="group">
              <p className="type-body">
                {t("admin.appeals.confirm", { outcome: t(`admin.appeals.outcome.${chosen}`) })}
              </p>
              <button
                ref={confirmButton}
                type="button"
                className="button-primary type-button"
                disabled={saving}
                onClick={() => void send(chosen)}
              >
                {t("admin.appeals.confirmYes")}
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
              {t("admin.appeals.send")}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
