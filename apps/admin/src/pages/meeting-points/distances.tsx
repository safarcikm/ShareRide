import {
  adminLegsStatusRoute,
  adminRecomputeLegsRoute,
  type AdminLegsStatus,
} from "@shareride/contracts";
import { icelandDate } from "@shareride/domain";
import { formatClock, formatCount, formatDate, type Locale } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { meetingPointsPath } from "./list.tsx";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly status: AdminLegsStatus };

/** A moment's date in Iceland: "16 November 2026". */
const dateText = (moment: Date, locale: Locale) => formatDate(icelandDate(moment), locale);

/**
 * Distances between meeting points (spec 2, 3.7.4): how many legs there
 * are between points in service, when they were computed and on which map
 * data, the points with no road near and the legs missing, and "Recompute
 * all" on the map data the API has now (ADR 0031).
 */
export function MeetingPointDistances() {
  const { t, locale, call } = useConsole();
  const base = useId();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const failedRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    setLoaded({ state: "loading" });
    const result = await call(adminLegsStatusRoute, {});
    setLoaded(result.ok ? { state: "ready", status: result.data } : { state: "failed" });
  }, [call]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (message !== null) messageRef.current?.focus();
  }, [message]);
  useEffect(() => {
    if (failed) failedRef.current?.focus();
  }, [failed]);

  async function recompute() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setMessage(null);
    const result = await call(adminRecomputeLegsRoute, { body: {} });
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setLoaded({ state: "ready", status: result.data });
    setMessage(t("admin.legs.recomputed", { count: result.data.withLegs }));
  }

  return (
    <section className="stack">
      <ConsoleLink to={meetingPointsPath} className="type-label">
        {t("admin.meetingPoint.back")}
      </ConsoleLink>
      <h1 className="type-title">{t("admin.legs.title")}</h1>
      <p className="type-body muted">{t("admin.legs.intro")}</p>
      {message === null ? null : (
        <p ref={messageRef} className="notice type-body" role="status" tabIndex={-1}>
          {message}
        </p>
      )}
      {loaded.state === "loading" ? (
        <p className="type-body muted">{t("common.loading")}</p>
      ) : loaded.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.legs.loadFailed")}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => void load()}
            >
              {t("admin.retry")}
            </button>
          </div>
        </div>
      ) : (
        <Status status={loaded.status} locale={locale} base={base}>
          <div className="stack">
            <div className="actions">
              <button
                type="button"
                className="button-primary type-button"
                // Not `disabled`, which would take the focus away from it.
                aria-disabled={busy}
                aria-describedby={`${base}-hint`}
                onClick={() => void recompute()}
              >
                {t(busy ? "admin.legs.recomputing" : "admin.legs.recompute")}
              </button>
            </div>
            <p id={`${base}-hint`} className="hint type-small">
              {t("admin.legs.recomputeHint")}
            </p>
            {failed ? (
              <p ref={failedRef} className="problem type-body" role="alert" tabIndex={-1}>
                {t("admin.legs.recomputeFailed")}
              </p>
            ) : null}
          </div>
        </Status>
      )}
    </section>
  );
}

/** The status itself; `children` is the recompute button, after the summary. */
function Status({
  status,
  locale,
  base,
  children,
}: {
  readonly status: AdminLegsStatus;
  readonly locale: Locale;
  readonly base: string;
  readonly children: ReactNode;
}) {
  const { t } = useConsole();
  const { mapData } = status;
  const older = status.sources
    .filter((source) => !source.current)
    .reduce((sum, source) => sum + source.legs, 0);
  const missing = status.pairs - status.withLegs;
  const computedAt = status.lastComputedAt === null ? null : new Date(status.lastComputedAt);

  return (
    <>
      <dl className="facts type-body">
        <dt>{t("admin.legs.points")}</dt>
        <dd>{formatCount(status.points, locale)}</dd>
        <dt>{t("admin.legs.legs")}</dt>
        <dd>
          {t("admin.legs.legsOf", {
            legs: formatCount(status.withLegs, locale),
            pairs: formatCount(status.pairs, locale),
          })}
        </dd>
        <dt>{t("admin.legs.computed")}</dt>
        <dd>
          {computedAt === null
            ? t("admin.legs.never")
            : t("admin.legs.computedAt", {
                date: dateText(computedAt, locale),
                time: formatClock(computedAt),
              })}
        </dd>
        <dt>{t("admin.legs.mapData")}</dt>
        <dd>
          {mapData.mapDate === null
            ? mapData.attribution
            : dateText(new Date(mapData.mapDate), locale)}
        </dd>
      </dl>
      {older === 0 ? null : (
        <p className="notice type-body">{t("admin.legs.olderData", { count: older })}</p>
      )}
      {children}
      {missing === 0 && status.offRoad.length === 0 ? (
        <p className="type-body">{t("admin.legs.complete")}</p>
      ) : null}
      {status.offRoad.length === 0 ? null : (
        <section className="stack" aria-labelledby={`${base}-off-road`}>
          <h2 id={`${base}-off-road`} className="type-heading">
            {t("admin.legs.offRoad")}
          </h2>
          <p className="type-body muted">{t("admin.legs.offRoadIntro")}</p>
          <ul className="type-body">
            {status.offRoad.map((point) => (
              <li key={point.id}>
                <ConsoleLink to={`${meetingPointsPath}/${point.id}`}>{point.nameIs}</ConsoleLink>
              </li>
            ))}
          </ul>
        </section>
      )}
      {missing === 0 ? null : (
        <section className="stack" aria-labelledby={`${base}-missing`}>
          <h2 id={`${base}-missing`} className="type-heading">
            {t("admin.legs.missing", { count: missing })}
          </h2>
          <p className="type-body muted">{t("admin.legs.missingIntro")}</p>
          {status.missing.length === 0 ? null : (
            <table className="changes type-body">
              <thead>
                <tr>
                  <th scope="col">{t("admin.legs.from")}</th>
                  <th scope="col">{t("admin.legs.to")}</th>
                </tr>
              </thead>
              <tbody>
                {status.missing.map((leg) => (
                  <tr key={`${leg.from.id}-${leg.to.id}`}>
                    <td>{leg.from.nameIs}</td>
                    <td>{leg.to.nameIs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {missing > status.missing.length ? (
            <p className="type-body">
              {t("admin.legs.more", {
                count: formatCount(missing - status.missing.length, locale),
              })}
            </p>
          ) : null}
        </section>
      )}
      {mapData.mapDate === null ? null : <p className="type-small muted">{mapData.attribution}</p>}
    </>
  );
}
