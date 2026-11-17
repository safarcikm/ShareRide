import {
  adminExcusedCancellationsRoute,
  adminOverruleRoute,
  adminReliabilityWatchRoute,
  type AdminExcusedCancellation,
  type AdminWatchedPerson,
} from "@shareride/contracts";
import { cancelReasonText, type MessageKey, type Translate } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";
import { atText, nameOf } from "../disputes/texts.ts";

type Loaded<T> =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly value: T };

/**
 * The Reliability section (spec 8, 3.8; R8.10, R8.11): the cancellations
 * that do not count only because of a weather or road-closure reason, which
 * the operator can overrule so that they count, and the people below the
 * watch level. The operator decides on a warning or a suspension as a
 * person (3.8.4); nothing here suspends anyone.
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

const routeOf = (t: Translate, cancellation: AdminExcusedCancellation, locale: "is" | "en") =>
  t("admin.reliability.route", { from: cancellation.from[locale], to: cancellation.to[locale] });

type Said =
  | { readonly kind: "none" }
  | { readonly kind: "overruled"; readonly name: string }
  | { readonly kind: "alreadyOverruled" }
  | { readonly kind: "gone" }
  | { readonly kind: "failed" };

function ExcusedCancellations() {
  const { t, locale, call } = useConsole();
  const [list, setList] = useState<Loaded<readonly AdminExcusedCancellation[]>>({
    state: "loading",
  });
  // The cancellation whose overruling waits for a yes, by `keyOf`.
  const [asking, setAsking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<Said>({ kind: "none" });
  const message = useRef<HTMLDivElement>(null);
  const yesButton = useRef<HTMLButtonElement>(null);
  const overruleButtons = useRef(new Map<string, HTMLButtonElement>());
  // The Overrule button to go back to once the question closes.
  const backTo = useRef<string | null>(null);
  const ids = { heading: useId(), hint: useId() };

  const load = useCallback(async () => {
    const result = await call(adminExcusedCancellationsRoute, {});
    setList(
      result.ok ? { state: "ready", value: result.data.cancellations } : { state: "failed" },
    );
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
    if (asking !== null) {
      yesButton.current?.focus();
    } else if (backTo.current !== null) {
      overruleButtons.current.get(backTo.current)?.focus();
      backTo.current = null;
    }
  }, [asking]);

  async function overrule(cancellation: AdminExcusedCancellation) {
    setSaving(true);
    const result = await call(adminOverruleRoute, {
      params: { kind: cancellation.kind, id: cancellation.id },
      body: {},
    });
    setSaving(false);
    setAsking(null);
    if (result.ok) {
      setList((shown) =>
        shown.state === "ready"
          ? {
              state: "ready",
              value: shown.value.map((one) =>
                keyOf(one) === keyOf(cancellation) ? result.data : one,
              ),
            }
          : shown,
      );
      setSaid({ kind: "overruled", name: nameOf(t, cancellation.person) });
      return;
    }
    const { code } = result.error;
    if (code === "already_overruled" || code === "not_found") {
      setSaid({ kind: code === "already_overruled" ? "alreadyOverruled" : "gone" });
      await load();
      return;
    }
    setSaid({ kind: "failed" });
  }

  return (
    <section className="stack" aria-labelledby={ids.heading}>
      <h2 id={ids.heading} className="type-heading">
        {t("admin.reliability.excused")}
      </h2>
      <p id={ids.hint} className="type-body muted">
        {t("admin.reliability.excusedHint")}
      </p>
      <div ref={message} className="message">
        {said.kind === "overruled" ? (
          <p className="notice type-body" role="status" tabIndex={-1}>
            {t("admin.reliability.overruledNow", { name: said.name })}
          </p>
        ) : said.kind === "none" ? null : (
          <p className="problem type-body" role="alert" tabIndex={-1}>
            {t(
              said.kind === "alreadyOverruled"
                ? "admin.reliability.alreadyOverruled"
                : said.kind === "gone"
                  ? "admin.reliability.gone"
                  : "admin.reliability.overruleFailed",
            )}
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
          <ul className="cards" aria-labelledby={ids.heading}>
            {list.value.map((cancellation) => {
              const key = keyOf(cancellation);
              const name = nameOf(t, cancellation.person);
              const route = routeOf(t, cancellation, locale);
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
                            when: atText(t, locale, cancellation.departsAt),
                          })} · `}
                      {t("admin.reliability.cancelledOn", {
                        when: atText(t, locale, cancellation.cancelledAt),
                      })}
                    </p>
                  </div>
                  {cancellation.overruledAt !== null ? (
                    <p className="tags">
                      <span className="tag type-small">
                        {t("admin.reliability.overruledOn", {
                          when: atText(t, locale, cancellation.overruledAt),
                        })}
                      </span>
                    </p>
                  ) : asking === key ? (
                    <div
                      className="confirm-row"
                      role="group"
                      aria-label={t("admin.reliability.confirmQuestion", { name })}
                    >
                      <p className="type-body">
                        {t("admin.reliability.confirmQuestion", { name })}
                      </p>
                      <button
                        ref={yesButton}
                        type="button"
                        className="button-primary type-button"
                        disabled={saving}
                        onClick={() => void overrule(cancellation)}
                      >
                        {t("admin.reliability.confirm")}
                      </button>
                      <button
                        type="button"
                        className="button-quiet type-label"
                        disabled={saving}
                        onClick={() => {
                          backTo.current = key;
                          setAsking(null);
                        }}
                      >
                        {t("admin.reliability.goBack")}
                      </button>
                    </div>
                  ) : (
                    <button
                      ref={(button) => {
                        if (button === null) overruleButtons.current.delete(key);
                        else overruleButtons.current.set(key, button);
                      }}
                      type="button"
                      className="button-secondary type-label"
                      aria-label={t("admin.reliability.overruleOf", { name, route })}
                      disabled={saving}
                      onClick={() => {
                        setSaid({ kind: "none" });
                        setAsking(key);
                      }}
                    >
                      {t("admin.reliability.overrule")}
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
