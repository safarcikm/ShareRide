import type { CallResult } from "@shareride/api-client";
import {
  adminPauseMeetingPointRoute,
  adminResumeMeetingPointRoute,
  adminRetireMeetingPointRoute,
  type AdminMeetingPoint,
} from "@shareride/contracts";
import {
  icelandDate,
  nextPointStatus,
  validatePause,
  type MeetingPointStatus,
  type PauseIssue,
  type PauseProblem,
  type PauseRequest,
  type StatusChange,
} from "@shareride/domain";
import { formatDate, type MessageKey } from "@shareride/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";

/** What a status change came to, for the page to show. */
export type StatusResult =
  | { readonly kind: "done"; readonly point: AdminMeetingPoint; readonly change: StatusChange }
  /** Saved or changed elsewhere since the page loaded it: the newest copy is needed. */
  | { readonly kind: "changed" }
  | { readonly kind: "failed" };

type Step = "none" | "pausing" | "retiring";

type StatusCall =
  | CallResult<typeof adminPauseMeetingPointRoute>
  | CallResult<typeof adminResumeMeetingPointRoute>
  | CallResult<typeof adminRetireMeetingPointRoute>;

const issueKeys: Record<PauseIssue, MessageKey> = {
  required: "admin.meetingPoint.issue.required",
  too_long: "admin.meetingPoint.issue.tooLong",
  // A date field gives a real day or none, so an unreadable one is not after today either.
  invalid: "admin.meetingPoint.issue.notAfterToday",
  not_after_today: "admin.meetingPoint.issue.notAfterToday",
};

const tomorrow = () => icelandDate(new Date(Date.now() + 24 * 3600_000));

/**
 * Whether a point is in use, and pausing, bringing back and retiring it
 * (spec 2, 3.6.4 and 3.6.5). What each status allows is the domain's
 * `nextPointStatus`. Nothing for a retired point, which stays as it was.
 */
export function StatusPanel({
  point,
  onResult,
}: {
  readonly point: AdminMeetingPoint;
  readonly onResult: (result: StatusResult) => void;
}) {
  const { t, locale, call } = useConsole();
  const [step, setStep] = useState<Step>("none");
  const [pause, setPause] = useState({ reasonIs: "", reasonEn: "", until: "" });
  const [problems, setProblems] = useState<readonly PauseProblem[]>([]);
  const [busy, setBusy] = useState(false);
  const base = useId();
  const idOf = (field: keyof PauseRequest) => `${base}-${field}`;
  const pauseButton = useRef<HTMLButtonElement>(null);
  const retireButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // The step that was open, whose button has the focus back when it closes.
  const closing = useRef<Step>("none");
  const firstReason = `${base}-reasonIs`;

  useEffect(() => {
    if (step === "pausing") document.getElementById(firstReason)?.focus();
    else if (step === "retiring") confirmButton.current?.focus();
    else if (closing.current !== "none") {
      (closing.current === "pausing" ? pauseButton : retireButton).current?.focus();
      closing.current = "none";
    }
  }, [step, firstReason]);

  if (point.status === "retired") return null;

  const status = point.status as MeetingPointStatus;
  const allows = (change: StatusChange) => nextPointStatus(status, change, point.futureTrips).ok;
  const retiresTo = nextPointStatus(status, "retire", point.futureTrips);
  const retiresLater = retiresTo.ok && retiresTo.value === "retiring";
  const name = point.nameIs;

  const open = (next: Step) => {
    setProblems([]);
    setStep(next);
  };
  /** Back to the buttons; `refocus` gives the focus back to the one that opened the step. */
  const close = (refocus: boolean) => {
    closing.current = refocus ? step : "none";
    setProblems([]);
    setStep("none");
  };

  async function send(change: StatusChange, request: () => Promise<StatusCall>) {
    setBusy(true);
    const result = await request();
    setBusy(false);
    if (result.ok) {
      setPause({ reasonIs: "", reasonEn: "", until: "" });
      close(false);
      onResult({ kind: "done", point: result.data, change });
      return;
    }
    const { code, details } = result.error;
    if (code === "validation_failed" && details !== undefined && details.length > 0) {
      const found = details.map((detail) => ({
        field: detail.path as keyof PauseRequest,
        issue: detail.issue as PauseIssue,
      }));
      setProblems(found);
      showFirst(found);
    } else if (code === "meeting_point_changed" || code === "status_change_not_allowed") {
      close(false);
      onResult({ kind: "changed" });
    } else {
      onResult({ kind: "failed" });
    }
  }

  /** The first field with a problem takes the focus, so its error is read. */
  function showFirst(found: readonly PauseProblem[]) {
    const [first] = found;
    if (first !== undefined) document.getElementById(idOf(first.field))?.focus();
  }

  function submitPause() {
    const checked = validatePause(
      { ...pause, until: pause.until === "" ? null : pause.until },
      icelandDate(new Date()),
    );
    if (!checked.ok) {
      setProblems(checked.error);
      showFirst(checked.error);
      return;
    }
    setProblems([]);
    void send("pause", () =>
      call(adminPauseMeetingPointRoute, {
        params: { id: point.id },
        body: { ...checked.value, updatedAt: point.updatedAt },
      }),
    );
  }

  const field = (
    key: keyof PauseRequest,
    label: MessageKey,
    hint: { readonly id: string; readonly text: MessageKey },
  ) => {
    const problem = problems.find((found) => found.field === key);
    const errorId = `${idOf(key)}-error`;
    return (
      <div className="field">
        <label htmlFor={idOf(key)} className="type-label">
          {t(label)}
        </label>
        <input
          id={idOf(key)}
          type={key === "until" ? "date" : "text"}
          min={key === "until" ? tomorrow() : undefined}
          autoComplete="off"
          className="input type-body"
          value={pause[key]}
          aria-invalid={problem !== undefined}
          aria-describedby={[hint.id, problem === undefined ? null : errorId]
            .filter((part) => part !== null)
            .join(" ")}
          onChange={(event) => {
            setPause({ ...pause, [key]: event.target.value });
            setProblems(problems.filter((found) => found.field !== key));
          }}
        />
        {key === "until" ? (
          <p id={hint.id} className="hint type-small">
            {t(hint.text)}
          </p>
        ) : null}
        {problem === undefined ? null : (
          <p id={errorId} className="field-error type-small">
            {t(issueKeys[problem.issue])}
          </p>
        )}
      </div>
    );
  };

  const reasonHint = { id: `${base}-reason-hint`, text: "admin.meetingPoint.reasonHint" as const };
  // What the change does, read with the button that makes it.
  const pauseNoteId = `${base}-pause-note`;
  const retireNoteId = `${base}-retire-note`;

  return (
    <section className="panel stack" aria-labelledby={`${base}-title`}>
      <h2 id={`${base}-title`} className="type-heading">
        {t("admin.meetingPoint.inUse")}
      </h2>
      {status === "draft" ? (
        <p className="type-body">{t("admin.meetingPoint.draftNotOffered")}</p>
      ) : (
        <p className="type-body">
          {t("admin.meetingPoint.upcomingTrips", { count: point.futureTrips })}
        </p>
      )}
      {status === "retiring" ? (
        <p className="type-body">{t("admin.meetingPoint.retiresAfterLastTrip")}</p>
      ) : null}
      {status === "paused" && point.pauseReason !== null ? (
        <>
          <dl className="facts type-body">
            <dt>{t("admin.meetingPoint.reasonIs")}</dt>
            <dd lang="is">{point.pauseReason.is}</dd>
            <dt>{t("admin.meetingPoint.reasonEn")}</dt>
            <dd lang="en">{point.pauseReason.en}</dd>
          </dl>
          <p className="type-body">
            {point.pausedUntil === null
              ? t("admin.meetingPoint.backByHand")
              : t("admin.meetingPoint.backOn", { date: formatDate(point.pausedUntil, locale) })}
          </p>
        </>
      ) : null}

      {step === "pausing" ? (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitPause();
          }}
        >
          {point.futureTrips > 0 ? (
            <p id={pauseNoteId} className="notice type-body">
              {t("admin.meetingPoint.pauseNote")}
            </p>
          ) : null}
          <p id={reasonHint.id} className="hint type-small">
            {t(reasonHint.text)}
          </p>
          {field("reasonIs", "admin.meetingPoint.reasonIs", reasonHint)}
          {field("reasonEn", "admin.meetingPoint.reasonEn", reasonHint)}
          {field("until", "admin.meetingPoint.until", {
            id: `${base}-until-hint`,
            text: "admin.meetingPoint.untilHint",
          })}
          <div className="actions">
            <button
              type="submit"
              className="button-primary type-button"
              disabled={busy}
              aria-describedby={point.futureTrips > 0 ? pauseNoteId : undefined}
            >
              {t("admin.meetingPoint.pauseConfirm", { name })}
            </button>
            <button
              type="button"
              className="button-quiet type-label"
              disabled={busy}
              onClick={() => {
                close(true);
              }}
            >
              {t("admin.meetingPoint.keepInUse")}
            </button>
          </div>
        </form>
      ) : step === "retiring" ? (
        <div
          className="stack"
          role="group"
          aria-label={t("admin.meetingPoint.retireQuestion", { name })}
        >
          <p className="type-body-strong">{t("admin.meetingPoint.retireQuestion", { name })}</p>
          <p id={retireNoteId} className="type-body">
            {retiresLater
              ? t("admin.meetingPoint.retireLater", { count: point.futureTrips })
              : t("admin.meetingPoint.retireNow")}
          </p>
          <div className="actions">
            <button
              ref={confirmButton}
              type="button"
              className="button-danger type-label"
              disabled={busy}
              aria-describedby={retireNoteId}
              onClick={() =>
                void send("retire", () =>
                  call(adminRetireMeetingPointRoute, {
                    params: { id: point.id },
                    body: { updatedAt: point.updatedAt },
                  }),
                )
              }
            >
              {t("admin.meetingPoint.retireConfirm", { name })}
            </button>
            <button
              type="button"
              className="button-quiet type-label"
              disabled={busy}
              onClick={() => {
                close(true);
              }}
            >
              {t("admin.meetingPoint.keep")}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {allows("pause") ? (
            <button
              ref={pauseButton}
              type="button"
              className="button-secondary type-label"
              disabled={busy}
              onClick={() => {
                open("pausing");
              }}
            >
              {t("admin.meetingPoint.pause")}
            </button>
          ) : null}
          {allows("resume") ? (
            <button
              type="button"
              className="button-secondary type-label"
              disabled={busy}
              onClick={() =>
                void send("resume", () =>
                  call(adminResumeMeetingPointRoute, {
                    params: { id: point.id },
                    body: { updatedAt: point.updatedAt },
                  }),
                )
              }
            >
              {t("admin.meetingPoint.resume")}
            </button>
          ) : null}
          {allows("retire") ? (
            <button
              ref={retireButton}
              type="button"
              className="button-secondary type-label"
              disabled={busy}
              onClick={() => {
                open("retiring");
              }}
            >
              {t("admin.meetingPoint.retire")}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
