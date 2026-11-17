import {
  adminMeetingPointIssuesRoute,
  adminResolveMeetingPointIssueRoute,
  type AdminMeetingPointIssue,
} from "@shareride/contracts";
import { checkIssueResolution, icelandDate, meetingPointIssueLimits } from "@shareride/domain";
import {
  formatClock,
  formatDate,
  issueReasonKeys,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { meetingPointsPath } from "./list.tsx";
import { statusKeys } from "./texts.ts";

export const problemsPath = `${meetingPointsPath}/problems`;

type Queue =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly issues: readonly AdminMeetingPointIssue[] };

/** The open reports, for the queue and the home page's count. */
export function useProblemQueue() {
  const { call } = useConsole();
  const [queue, setQueue] = useState<Queue>({ state: "loading" });
  const load = useCallback(async () => {
    const result = await call(adminMeetingPointIssuesRoute, {});
    setQueue(result.ok ? { state: "ready", issues: result.data.issues } : { state: "failed" });
  }, [call]);
  useEffect(() => {
    void load();
  }, [load]);
  return { queue, reload: load };
}

/** "Sent 16 November 2026 at 22:10", in Iceland. */
function sentText(t: Translate, locale: Locale, at: string): string {
  const moment = new Date(at);
  const date = icelandDate(moment);
  return t("admin.meetingPointIssues.sentAt", {
    date: formatDate(date, locale),
    time: formatClock(moment),
  });
}

/**
 * Problem reports about meeting points (spec 2, 3.5): the open ones, the
 * oldest first, each with its point, what is wrong and the note, never who
 * sent it. Resolving needs a note on what was done and can mark the point
 * checked today; pausing it is on the point's own page.
 */
export function MeetingPointProblems() {
  const { t } = useConsole();
  const { queue, reload } = useProblemQueue();
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [focusMessage, setFocusMessage] = useState(false);

  useEffect(() => {
    if (!focusMessage) return;
    setFocusMessage(false);
    messageRef.current?.focus();
  }, [focusMessage]);

  return (
    <section className="stack">
      <ConsoleLink to={meetingPointsPath} className="type-label">
        {t("admin.meetingPoint.back")}
      </ConsoleLink>
      <h1 className="type-title">{t("admin.meetingPointIssues.title")}</h1>
      <p className="type-body muted">{t("admin.meetingPointIssues.intro")}</p>
      {message === null ? null : (
        <p ref={messageRef} className="notice type-body" role="status" tabIndex={-1}>
          {message}
        </p>
      )}
      {queue.state === "loading" ? (
        <p className="type-body muted">{t("common.loading")}</p>
      ) : queue.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.meetingPointIssues.loadFailed")}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => void reload()}
            >
              {t("admin.retry")}
            </button>
          </div>
        </div>
      ) : queue.issues.length === 0 ? (
        <p className="type-body">{t("admin.meetingPointIssues.empty")}</p>
      ) : (
        <div className="cards">
          {queue.issues.map((issue) => (
            <Problem
              key={issue.id}
              issue={issue}
              onGone={(resolvedHere) => {
                setMessage(
                  resolvedHere
                    ? t("admin.meetingPointIssues.resolved", { name: issue.meetingPoint.nameIs })
                    : t("admin.meetingPointIssues.alreadyResolved"),
                );
                setFocusMessage(true);
                void reload();
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type NoteProblem = "required" | "tooLong" | "failed";

/**
 * One open report and its resolve form. `onGone` takes it off the list:
 * resolved here, or by someone else meanwhile.
 */
function Problem({
  issue,
  onGone,
}: {
  readonly issue: AdminMeetingPointIssue;
  readonly onGone: (resolvedHere: boolean) => void;
}) {
  const { t, locale, call } = useConsole();
  const base = useId();
  const noteId = `${base}-note`;
  const errorId = `${base}-error`;
  const hintId = `${base}-hint`;
  const [note, setNote] = useState("");
  const [checkedToday, setCheckedToday] = useState(false);
  const [problem, setProblem] = useState<NoteProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const max = meetingPointIssueLimits.resolutionMax;
  const { meetingPoint } = issue;

  const problemText: Record<NoteProblem, string> = {
    required: t("admin.meetingPointIssues.resolutionRequired"),
    tooLong: t("admin.meetingPointIssues.resolutionTooLong", { max }),
    failed: t("admin.meetingPointIssues.resolveFailed"),
  };

  /** The note's problem, by the field, from the domain's own check. */
  function showNoteProblem(issueCode: string) {
    setProblem(issueCode === "too_long" ? "tooLong" : "required");
    noteField.current?.focus();
  }

  async function resolve() {
    const checked = checkIssueResolution(note);
    if (!checked.ok) {
      showNoteProblem(checked.error.code);
      return;
    }
    setProblem(null);
    setBusy(true);
    const result = await call(adminResolveMeetingPointIssueRoute, {
      params: { id: issue.id },
      body: { note: checked.value, checkedToday },
    });
    if (result.ok || result.error.code === "issue_resolved") {
      // The card goes with the next list; until then, nothing to press.
      onGone(result.ok);
      return;
    }
    setBusy(false);
    const noteIssue = result.error.details?.find((detail) => detail.path === "note")?.issue;
    if (result.error.code === "validation_failed" && noteIssue !== undefined) {
      showNoteProblem(noteIssue);
      return;
    }
    setProblem("failed");
  }

  const fieldProblem = problem === "required" || problem === "tooLong";
  return (
    <article className="card stack" aria-labelledby={`${base}-name`}>
      <h2 id={`${base}-name`} className="type-heading">
        <ConsoleLink to={`${meetingPointsPath}/${meetingPoint.id}`}>
          {meetingPoint.nameIs}
        </ConsoleLink>
      </h2>
      {meetingPoint.status === "active" ? null : (
        <p className="tags">
          <span className={`tag status-${meetingPoint.status} type-small`}>
            {t(statusKeys[meetingPoint.status])}
          </span>
        </p>
      )}
      <p className="type-body-strong">{t(issueReasonKeys[issue.reason])}</p>
      <p className="type-body line-breaks">
        {issue.note === "" ? t("admin.meetingPointIssues.noNote") : issue.note}
      </p>
      <p className="type-small muted">{sentText(t, locale, issue.sentAt)}</p>
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void resolve();
        }}
      >
        <div className="field">
          <label htmlFor={noteId} className="type-label">
            {t("admin.meetingPointIssues.resolution")}
          </label>
          <textarea
            ref={noteField}
            id={noteId}
            className="input textarea type-body"
            rows={2}
            value={note}
            aria-invalid={fieldProblem}
            aria-describedby={fieldProblem ? `${hintId} ${errorId}` : hintId}
            onChange={(event) => {
              setNote(event.target.value);
              if (fieldProblem) setProblem(null);
            }}
          />
          <p id={hintId} className="hint type-small">
            {t("admin.meetingPointIssues.resolutionHint", { max })}
          </p>
          {fieldProblem ? (
            <p id={errorId} className="field-error type-small">
              {problemText[problem]}
            </p>
          ) : null}
        </div>
        <p className="check-row">
          <label className="check type-body">
            <input
              type="checkbox"
              checked={checkedToday}
              onChange={(event) => {
                setCheckedToday(event.target.checked);
              }}
            />
            {t("admin.meetingPointIssues.checkedToday")}
          </label>
        </p>
        {meetingPoint.status === "active" ? (
          <p className="type-body">
            <ConsoleLink to={`${meetingPointsPath}/${meetingPoint.id}?pause`}>
              {t("admin.meetingPointIssues.pause", { name: meetingPoint.nameIs })}
            </ConsoleLink>
          </p>
        ) : null}
        <div className="actions">
          <button type="submit" className="button-primary type-button" disabled={busy}>
            {t("admin.meetingPointIssues.resolve")}
          </button>
        </div>
        {problem === "failed" ? (
          <p className="problem type-body" role="alert">
            {problemText[problem]}
          </p>
        ) : null}
      </form>
    </article>
  );
}
