import {
  adminChangeCountingRoute,
  adminExcusedCancellationsRoute,
  adminReliabilityWatchRoute,
  type AdminExcusedCancellation,
  type AdminWatchedPerson,
} from "@shareride/contracts";
import { checkOverruleNote, inIceland } from "@shareride/domain";
import {
  cancelReasonText,
  formatClock,
  formatDate,
  type Locale,
  type MessageKey,
  type Translate,
} from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useConsole } from "../../console.tsx";
import { nameOf } from "../disputes/texts.ts";

type Loaded<T> =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly value: T };

/**
 * The Reliability section (spec 8, 3.8; R8.10, R8.11): the cancellations
 * that do not count only because of a weather or road-closure reason, which
 * the operator can make count, or undo that, with a note (section 6); and
 * the people below the watch level. The operator decides on a warning or a
 * suspension as a person (3.8.4); nothing here suspends anyone.
 */
export function ReliabilityPage() {
  const { t } = useConsole();
  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.reliability.title")}</h1>
      <p className="type-body muted">{t("admin.reliability.intro")}</p>
      <ExcusedCancellations />
      <WatchList />
    </section>
  );
}

/** Who cancelled, in which role, and what. */
const whoKey = (cancellation: AdminExcusedCancellation): MessageKey =>
  cancellation.kind === "trip"
    ? "admin.reliability.who.trip"
    : cancellation.role === "driver"
      ? "admin.reliability.who.driverBooking"
      : "admin.reliability.who.passenger";

const keyOf = (cancellation: AdminExcusedCancellation) => `${cancellation.kind}/${cancellation.id}`;

const routeOf = (t: Translate, locale: Locale, cancellation: AdminExcusedCancellation) =>
  t("admin.reliability.route", { from: cancellation.from[locale], to: cancellation.to[locale] });

/**
 * A moment in Iceland with its year, since the list goes back 12 months:
 * "15 November 2026 at 08:10".
 */
function dateText(t: Translate, locale: Locale, at: string): string {
  const moment = new Date(at);
  const { year, month, day } = inIceland(moment);
  return t("admin.disputes.at", {
    date: formatDate([year, month, day].join("-"), locale),
    time: formatClock(moment),
  });
}

/** What the last change said, above the list. */
type Said =
  | { readonly kind: "none" }
  | { readonly kind: "changed"; readonly name: string; readonly counts: boolean }
  | {
      readonly kind: "changedMeanwhile" | "gone";
      /** Whether the list was loaded again, to show it as it is now. */
      readonly reloaded: boolean;
    };

function ExcusedCancellations() {
  const { t, locale, call } = useConsole();
  const [list, setList] = useState<Loaded<readonly AdminExcusedCancellation[]>>({
    state: "loading",
  });
  // The cancellation whose note is being written, by `keyOf`.
  const [open, setOpen] = useState<string | null>(null);
  // While a change is sent, no other card's form opens.
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<Said>({ kind: "none" });
  const message = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // The card's button to go back to once its form closes without a change.
  const backTo = useRef<string | null>(null);
  const heading = useId();

  /** Loads the list; true when it came. */
  const load = useCallback(async () => {
    const result = await call(adminExcusedCancellationsRoute, {});
    setList(result.ok ? { state: "ready", value: result.data.cancellations } : { state: "failed" });
    return result.ok;
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  // A result or a problem takes the focus, so it is read at once.
  useEffect(() => {
    const shown = message.current?.firstElementChild;
    if (said.kind !== "none" && shown instanceof HTMLElement) shown.focus();
  }, [said]);

  useEffect(() => {
    if (open === null && backTo.current !== null) {
      buttons.current.get(backTo.current)?.focus();
      backTo.current = null;
    }
  }, [open]);

  function changed(cancellation: AdminExcusedCancellation) {
    setList((shown) =>
      shown.state === "ready"
        ? {
            state: "ready",
            value: shown.value.map((one) =>
              keyOf(one) === keyOf(cancellation) ? cancellation : one,
            ),
          }
        : shown,
    );
    setOpen((current) => (current === keyOf(cancellation) ? null : current));
    setSaid({
      kind: "changed",
      name: nameOf(t, cancellation.person),
      counts: cancellation.overruledAt !== null,
    });
  }

  /** Someone else changed it, or it left the list: show the list as it is now. */
  async function stale(kind: "changedMeanwhile" | "gone") {
    setOpen(null);
    const reloaded = await load();
    setSaid({ kind, reloaded });
  }

  return (
    <section className="stack" aria-labelledby={heading}>
      <h2 id={heading} className="type-heading">
        {t("admin.reliability.excused")}
      </h2>
      <p className="type-body muted">{t("admin.reliability.excusedHint")}</p>
      <div ref={message} className="message">
        {said.kind === "changed" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {t(said.counts ? "admin.reliability.countsNow" : "admin.reliability.notCountingNow", {
              name: said.name,
            })}
          </p>
        ) : said.kind === "none" ? null : (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t(
              said.kind === "changedMeanwhile"
                ? "admin.reliability.changedMeanwhile"
                : "admin.reliability.gone",
            )}
            {said.reloaded ? ` ${t("admin.reliability.listNow")}` : null}
          </p>
        )}
      </div>
      {list.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.reliability.excusedFailed")}
          </p>
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setList({ state: "loading" });
              void load();
            }}
          >
            {t("admin.reliability.loadExcusedAgain")}
          </button>
        </div>
      ) : list.value.length === 0 ? (
        <p className="type-body muted">{t("admin.reliability.noneExcused")}</p>
      ) : (
        <>
          <p className="type-body" role="status">
            {t("admin.reliability.excusedCount", { count: list.value.length })}
          </p>
          <ul className="cards" aria-labelledby={heading}>
            {list.value.map((cancellation) => {
              const key = keyOf(cancellation);
              const name = nameOf(t, cancellation.person);
              const route = routeOf(t, locale, cancellation);
              const counts = cancellation.overruledAt !== null;
              const cancelledOn = dateText(t, locale, cancellation.cancelledAt);
              return (
                <li key={key} className="card">
                  <div className="card-text">
                    <h3 className="type-heading">{route}</h3>
                    <p className="type-body">{t(whoKey(cancellation), { name })}</p>
                    <p className="type-body">
                      {t("admin.reliability.reason", {
                        reason: cancelReasonText(t, cancellation.reason),
                      })}
                    </p>
                    {cancellation.note === "" ? null : (
                      <p className="type-body">
                        {t("admin.reliability.note", { note: cancellation.note })}
                      </p>
                    )}
                    <p className="type-small muted">
                      {cancellation.departsAt === null
                        ? null
                        : `${t("admin.reliability.leaving", {
                            when: dateText(t, locale, cancellation.departsAt),
                          })} · `}
                      {t("admin.reliability.cancelledOn", { when: cancelledOn })}
                    </p>
                    {cancellation.overruleNote === "" ? null : (
                      <p className="type-small">
                        {t("admin.reliability.operatorNote", { note: cancellation.overruleNote })}
                      </p>
                    )}
                  </div>
                  {cancellation.overruledAt === null ? null : (
                    <p className="tags">
                      <span className="tag type-small">
                        {t("admin.reliability.overruledOn", {
                          when: dateText(t, locale, cancellation.overruledAt),
                        })}
                      </span>
                    </p>
                  )}
                  {open === key ? (
                    <CountingForm
                      cancellation={cancellation}
                      counts={!counts}
                      saving={saving}
                      onSaving={setSaving}
                      onChanged={changed}
                      onStale={(kind) => void stale(kind)}
                      onCancel={() => {
                        backTo.current = key;
                        setOpen(null);
                      }}
                    />
                  ) : (
                    <button
                      ref={(button) => {
                        if (button === null) buttons.current.delete(key);
                        else buttons.current.set(key, button);
                      }}
                      type="button"
                      className="button-secondary type-label"
                      disabled={saving}
                      aria-label={t(
                        counts ? "admin.reliability.undoOf" : "admin.reliability.overruleOf",
                        { name, route, when: cancelledOn },
                      )}
                      onClick={() => {
                        setSaid({ kind: "none" });
                        setOpen(key);
                      }}
                    >
                      {t(counts ? "admin.reliability.undo" : "admin.reliability.overrule")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

type NoteProblem = "missing" | "tooLong" | null;

/**
 * The note that makes a cancellation count (`counts`), or no longer count,
 * and the button that sends it. The note is the operator's only.
 */
function CountingForm({
  cancellation,
  counts,
  saving,
  onSaving,
  onChanged,
  onStale,
  onCancel,
}: {
  readonly cancellation: AdminExcusedCancellation;
  readonly counts: boolean;
  readonly saving: boolean;
  readonly onSaving: (saving: boolean) => void;
  readonly onChanged: (cancellation: AdminExcusedCancellation) => void;
  readonly onStale: (kind: "changedMeanwhile" | "gone") => void;
  readonly onCancel: () => void;
}) {
  const { t, call } = useConsole();
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<NoteProblem>(null);
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const ids = { note: useId(), hint: useId(), error: useId() };

  useEffect(() => {
    field.current?.focus();
  }, []);

  /** Shows the note's problem, then moves to the note, so both are read together. */
  function showProblem(shown: NoteProblem) {
    flushSync(() => {
      setProblem(shown);
    });
    field.current?.focus();
  }

  async function send() {
    if (saving) return;
    // As the API checks it, so the problem shows before anything is sent.
    const checked = checkOverruleNote(note);
    if (!checked.ok) {
      showProblem(checked.error.code === "note_missing" ? "missing" : "tooLong");
      return;
    }
    onSaving(true);
    setFailed(false);
    const result = await call(adminChangeCountingRoute, {
      params: { kind: cancellation.kind, id: cancellation.id },
      body: { counts, note: checked.value },
    });
    onSaving(false);
    if (result.ok) {
      onChanged(result.data);
      return;
    }
    const { code, details } = result.error;
    const onNote = details?.find((detail) => detail.path === "note");
    if (code === "validation_failed" && onNote !== undefined) {
      showProblem(onNote.issue === "missing" ? "missing" : "tooLong");
    } else if (code === "unchanged") {
      onStale("changedMeanwhile");
    } else if (code === "not_found") {
      onStale("gone");
    } else {
      setFailed(true);
    }
  }

  return (
    <form
      className="stack wide"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div className="field">
        <label htmlFor={ids.note} className="type-label">
          {t(counts ? "admin.reliability.whyCounts" : "admin.reliability.whyNot")}
        </label>
        <textarea
          ref={field}
          id={ids.note}
          className="input textarea type-body"
          rows={3}
          value={note}
          required
          aria-invalid={problem !== null}
          aria-describedby={problem === null ? ids.hint : `${ids.hint} ${ids.error}`}
          onChange={(event) => {
            setNote(event.target.value);
            if (problem !== null) setProblem(null);
          }}
        />
        <p id={ids.hint} className="hint type-small">
          {t("admin.reliability.noteHint")}
        </p>
        {problem === null ? null : (
          <p id={ids.error} className="field-error type-small">
            {t(
              problem === "missing"
                ? "admin.reliability.noteMissing"
                : "admin.reliability.noteTooLong",
            )}
          </p>
        )}
      </div>
      {failed ? (
        <p className="problem type-body" role="alert">
          {t("admin.reliability.saveFailed")}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="button-primary type-button" disabled={saving}>
          {t(counts ? "admin.reliability.makeCount" : "admin.reliability.stopCounting")}
        </button>
        <button
          type="button"
          className="button-quiet type-label"
          disabled={saving}
          onClick={onCancel}
        >
          {t("admin.reliability.goBack")}
        </button>
      </div>
    </form>
  );
}

function WatchList() {
  const { t, call } = useConsole();
  const [list, setList] = useState<
    Loaded<{ readonly watchPercent: number; readonly people: readonly AdminWatchedPerson[] }>
  >({ state: "loading" });
  const heading = useId();

  const load = useCallback(async () => {
    const result = await call(adminReliabilityWatchRoute, {});
    setList(result.ok ? { state: "ready", value: result.data } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="stack" aria-labelledby={heading}>
      <h2 id={heading} className="type-heading">
        {t("admin.reliability.watch")}
      </h2>
      {list.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.reliability.watchFailed")}
          </p>
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setList({ state: "loading" });
              void load();
            }}
          >
            {t("admin.reliability.loadWatchAgain")}
          </button>
        </div>
      ) : (
        <>
          <p className="type-body muted">
            {t("admin.reliability.watchHint", { percent: list.value.watchPercent })}
          </p>
          {list.value.people.length === 0 ? (
            <p className="type-body muted">
              {t("admin.reliability.noneWatched", { percent: list.value.watchPercent })}
            </p>
          ) : (
            <ul className="cards" aria-labelledby={heading}>
              {list.value.people.map((person) => {
                const { kept, counted, percent, byRole } = person.reliability;
                return (
                  <li key={person.userId} className="card">
                    <div className="card-text">
                      <h3 className="type-heading">
                        {t("admin.reliability.figure", {
                          name: nameOf(t, person),
                          percent: percent ?? 0,
                        })}
                      </h3>
                      <p className="type-body">{t("admin.reliability.kept", { kept, counted })}</p>
                      <p className="type-small muted">
                        {t("admin.reliability.byRole", {
                          driverKept: byRole.driver.kept,
                          driverCounted: byRole.driver.counted,
                          passengerKept: byRole.passenger.kept,
                          passengerCounted: byRole.passenger.counted,
                        })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
