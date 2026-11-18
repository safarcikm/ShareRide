import {
  adminDeclineRatesRoute,
  adminFindUsersRoute,
  type AdminDeclineRate,
  type AdminUserListItem,
} from "@shareride/contracts";
import { formatPhoneNumber } from "@shareride/domain";
import { formatDay } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConsoleLink } from "../../components/console-link.tsx";
import { useConsole } from "../../console.tsx";
import { personName, standingText, usersPath } from "../reports/texts.ts";
import { declinesText, reasonsText } from "./texts.ts";

type Found =
  | { readonly state: "none" }
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | {
      readonly state: "ready";
      readonly users: readonly AdminUserListItem[];
      /** More people matched than the list shows. */
      readonly more: boolean;
    };

/**
 * Find people by first name, phone number, email or ID (spec 9, 3.5.1).
 * What was typed stays on the page, never in the address, as it can be a
 * phone number or an email. Below, each driver's request decline rate
 * (3.4.5).
 */
export function UserSearch() {
  const { t, locale, call } = useConsole();
  const [query, setQuery] = useState("");
  const [missing, setMissing] = useState(false);
  const [found, setFound] = useState<Found>({ state: "none" });
  const field = useRef<HTMLInputElement>(null);
  // An empty search takes the focus once its problem is on the page.
  const [checks, setChecks] = useState(0);
  // Only the newest request may show its answer.
  const request = useRef(0);
  const ids = {
    form: useId(),
    query: useId(),
    hint: useId(),
    error: useId(),
    list: useId(),
  };

  useEffect(() => {
    if (checks > 0) field.current?.focus();
  }, [checks]);

  async function search() {
    const q = query.trim();
    if (q === "") {
      setMissing(true);
      setChecks((count) => count + 1);
      return;
    }
    const mine = ++request.current;
    setFound({ state: "loading" });
    const result = await call(adminFindUsersRoute, { body: { q } });
    if (mine !== request.current) return;
    setFound(
      result.ok
        ? { state: "ready", users: result.data.users, more: result.data.more }
        : { state: "failed" },
    );
  }

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.users.title")}</h1>
      <p className="type-body muted">{t("admin.users.intro")}</p>
      <form
        className="stack panel"
        role="search"
        aria-labelledby={ids.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <h2 id={ids.form} className="type-heading">
          {t("admin.users.find")}
        </h2>
        <div className="field">
          <label htmlFor={ids.query} className="type-label">
            {t("admin.users.query")}
          </label>
          <input
            id={ids.query}
            ref={field}
            className="input type-body"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={missing}
            aria-describedby={missing ? `${ids.hint} ${ids.error}` : ids.hint}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMissing(false);
            }}
          />
          <p id={ids.hint} className="hint type-small">
            {t("admin.users.queryHint")}
          </p>
          {missing ? (
            <p id={ids.error} className="field-error type-small">
              {t("admin.users.queryMissing")}
            </p>
          ) : null}
        </div>
        <div className="actions">
          <button
            type="submit"
            className="button-primary type-button"
            disabled={found.state === "loading"}
          >
            {t("admin.users.search")}
          </button>
        </div>
      </form>
      <div className="stack">
        {found.state === "none" ? null : (
          <h2 id={ids.list} className="type-heading">
            {t("admin.users.found")}
          </h2>
        )}
        {/* One live region for the search, there from the start, so each answer is read out. */}
        <div role="status">
          {found.state === "loading" ? (
            <p className="type-body">{t("common.loading")}</p>
          ) : found.state === "ready" ? (
            <>
              <p className="type-body">
                {found.users.length === 0
                  ? t("admin.users.none")
                  : t("admin.users.count", { count: found.users.length })}
              </p>
              {found.more ? (
                <p className="type-body">{t("admin.users.more", { count: found.users.length })}</p>
              ) : null}
            </>
          ) : null}
        </div>
        {found.state === "failed" ? (
          <p className="problem type-body" role="alert">
            {t("admin.users.searchFailed")}
          </p>
        ) : found.state !== "ready" || found.users.length === 0 ? null : (
          <ul className="cards" aria-labelledby={ids.list}>
            {found.users.map((user) => (
              <li key={user.person.userId} className="card entry">
                <ConsoleLink to={`${usersPath}/${user.person.userId}`} className="type-label">
                  {personName(t, user.person)}
                </ConsoleLink>
                <p className="type-body">
                  {[
                    user.phone === null ? null : formatPhoneNumber(user.phone),
                    user.email,
                    t("admin.users.joined", { when: formatDay(new Date(user.joinedAt), locale) }),
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")}
                </p>
                {user.person.status === "active" ? null : (
                  <p className="tags">
                    <span className="tag tag-warning type-small">
                      {standingText(t, locale, user.person)}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <DeclineRates />
    </section>
  );
}

type Rates =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly drivers: readonly AdminDeclineRate[] };

/**
 * Each driver who answered a request in the last 90 days, the highest
 * share of declines first, so a pattern that could be discrimination can
 * be looked at (spec 9, 3.4.5; spec 5).
 */
function DeclineRates() {
  const { t, locale, call } = useConsole();
  const [rates, setRates] = useState<Rates>({ state: "loading" });
  const heading = useId();

  const load = useCallback(async () => {
    setRates({ state: "loading" });
    const result = await call(adminDeclineRatesRoute, {});
    setRates(result.ok ? { state: "ready", drivers: result.data.drivers } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel stack" aria-labelledby={heading}>
      <h2 id={heading} className="type-heading">
        {t("admin.users.declines")}
      </h2>
      <p className="type-body muted">{t("admin.users.declinesIntro")}</p>
      {rates.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : rates.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.users.declinesFailed")}
          </p>
          <button type="button" className="button-secondary type-label" onClick={() => void load()}>
            {t("admin.retry")}
          </button>
        </div>
      ) : rates.drivers.length === 0 ? (
        <p className="type-body muted">{t("admin.users.declinesNone")}</p>
      ) : (
        <ul className="cards" aria-labelledby={heading}>
          {rates.drivers.map((rate) => (
            <li key={rate.driver.userId} className="card entry">
              {rate.driver.status === "deleted" ? (
                <p className="type-label">{personName(t, rate.driver)}</p>
              ) : (
                <ConsoleLink to={`${usersPath}/${rate.driver.userId}`} className="type-label">
                  {personName(t, rate.driver)}
                </ConsoleLink>
              )}
              <p className="type-body">{declinesText(t, locale, rate)}</p>
              {rate.declined === 0 ? null : (
                <p className="type-small muted">{reasonsText(t, rate.reasons)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
