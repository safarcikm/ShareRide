import {
  adminDisputesRoute,
  type AdminDisputeListItem,
  type adminDisputeStates,
} from "@shareride/contracts";
import { useCallback, useEffect, useId, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { atText, disputesPath, kindKeys, nameOf, outcomeTexts } from "./texts.ts";

type View = (typeof adminDisputeStates)[number];

/** The view in the address: `?state=decided`, or the reports waiting. */
const viewFromAddress = (): View =>
  new URLSearchParams(window.location.search).get("state") === "decided" ? "decided" : "waiting";

type List =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly disputes: readonly AdminDisputeListItem[] };

/**
 * The contested reports waiting for the operator, oldest first, or the last
 * ones an operator decided, newest first (spec 8, 3.5).
 */
export function DisputeList() {
  const { t, locale, call } = useConsole();
  const [view] = useState(viewFromAddress);
  const [list, setList] = useState<List>({ state: "loading" });
  const ids = { views: useId(), list: useId() };

  const load = useCallback(async () => {
    setList({ state: "loading" });
    const result = await call(adminDisputesRoute, { query: { state: view } });
    setList(result.ok ? { state: "ready", disputes: result.data.disputes } : { state: "failed" });
  }, [call, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = view === "waiting";

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.disputes.title")}</h1>
      <p className="type-body muted">{t("admin.disputes.intro")}</p>
      <nav className="views" aria-label={t("admin.disputes.views")}>
        <ConsoleLink
          to={disputesPath}
          current={waiting}
          className="button-secondary link-button type-label"
        >
          {t("admin.disputes.waiting")}
        </ConsoleLink>
        <ConsoleLink
          to={`${disputesPath}?state=decided`}
          current={!waiting}
          className="button-secondary link-button type-label"
        >
          {t("admin.disputes.decided")}
        </ConsoleLink>
      </nav>
      <h2 id={ids.list} className="type-heading">
        {t(waiting ? "admin.disputes.waitingHeading" : "admin.disputes.decidedHeading")}
      </h2>
      {list.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.disputes.loadFailed")}
          </p>
          <button type="button" className="button-secondary type-label" onClick={() => void load()}>
            {t("admin.retry")}
          </button>
        </div>
      ) : list.disputes.length === 0 ? (
        <p className="type-body muted">
          {t(waiting ? "admin.disputes.noneWaiting" : "admin.disputes.noneDecided")}
        </p>
      ) : (
        <>
          <p className="type-body" role="status">
            {t(waiting ? "admin.disputes.waitingCount" : "admin.disputes.decidedCount", {
              count: list.disputes.length,
            })}
          </p>
          <ul className="cards" aria-labelledby={ids.list}>
            {list.disputes.map((dispute) => (
              <li key={dispute.id} className="card">
                <div className="card-text">
                  <p className="type-heading">
                    <ConsoleLink to={`${disputesPath}/${dispute.id}`}>
                      {t("admin.disputes.cardTitle", {
                        kind: t(kindKeys[dispute.kind]),
                        from: dispute.from.name[locale],
                        to: dispute.to.name[locale],
                      })}
                    </ConsoleLink>
                  </p>
                  <p className="type-body">
                    {t("admin.disputes.people", {
                      driver: nameOf(t, dispute.driver),
                      passenger: nameOf(t, dispute.passenger),
                    })}
                  </p>
                  <p className="type-small muted">
                    {dispute.from.plannedAt === null
                      ? null
                      : `${t("admin.disputes.plannedAt", {
                          when: atText(t, locale, dispute.from.plannedAt),
                        })} · `}
                    {dispute.decidedAt === null
                      ? t("admin.disputes.raised", { when: atText(t, locale, dispute.raisedAt) })
                      : t("admin.disputes.decidedOn", {
                          when: atText(t, locale, dispute.decidedAt),
                        })}
                  </p>
                </div>
                {dispute.outcome === null ? null : (
                  <p className="tags">
                    <span className="tag type-small">
                      {t(outcomeTexts(dispute.kind, dispute.outcome).label)}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
