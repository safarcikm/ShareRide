import {
  adminCreateInviteCodeRoute,
  adminEndInviteCodeRoute,
  adminInviteCodesRoute,
  type AdminInviteCode,
  type AdminInviteCodes,
} from "@shareride/contracts";
import { groupCodeRules, icelandDate } from "@shareride/domain";
import { formatCount, formatDate } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly overview: AdminInviteCodes };

const day = 24 * 60 * 60 * 1000;
const defaultUses = 20;
const defaultDays = 30;

/** The last second of a day in Iceland, which keeps UTC all year. */
const endOfDay = (date: string) => `${date}T23:59:59.000Z`;

/**
 * Invite codes (spec 12, 3.2 and screen 5): the places left in the beta,
 * a form for a new group code, and every code with its uses. A code can be
 * ended; the accounts made with it stay.
 */
export function InviteCodesPage() {
  const { t, locale, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [made, setMade] = useState<AdminInviteCode | null>(null);

  const load = useCallback(async () => {
    const result = await call(adminInviteCodesRoute, {});
    setLoaded(result.ok ? { state: "ready", overview: result.data } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.inviteCodes.title")}</h1>
      <p className="type-body muted">{t("admin.inviteCodes.intro")}</p>
      {loaded.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : loaded.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.inviteCodes.loadFailed")}
          </p>
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setLoaded({ state: "loading" });
              void load();
            }}
          >
            {t("admin.retry")}
          </button>
        </div>
      ) : (
        <>
          <p className="notice type-body">
            {loaded.overview.required
              ? t("admin.inviteCodes.places", {
                  testers: formatCount(loaded.overview.testers, locale),
                  max: formatCount(loaded.overview.maxTesters, locale),
                  left: formatCount(loaded.overview.placesLeft, locale),
                })
              : t("admin.inviteCodes.notRequired")}
          </p>
          {made === null ? null : (
            <p className="notice type-body" role="status">
              {t("admin.inviteCodes.made", { code: made.code, name: made.name })}
            </p>
          )}
          <NewCodeForm
            onMade={(code) => {
              setMade(code);
              void load();
            }}
          />
          <h2 className="type-heading">{t("admin.inviteCodes.listTitle")}</h2>
          {loaded.overview.codes.length === 0 ? (
            <p className="type-body muted">{t("admin.inviteCodes.none")}</p>
          ) : (
            <ul className="cards">
              {loaded.overview.codes.map((code) => (
                <CodeCard key={code.id} code={code} onEnded={() => void load()} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function NewCodeForm({ onMade }: { readonly onMade: (code: AdminInviteCode) => void }) {
  const { t, call } = useConsole();
  const [today] = useState(() => new Date());
  const [name, setName] = useState("");
  const [uses, setUses] = useState(String(defaultUses));
  const [ends, setEnds] = useState(() =>
    icelandDate(new Date(today.getTime() + defaultDays * day)),
  );
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const usesInput = useRef<HTMLInputElement>(null);
  const endsInput = useRef<HTMLInputElement>(null);
  const ids = {
    title: useId(),
    name: useId(),
    nameError: useId(),
    uses: useId(),
    usesError: useId(),
    ends: useId(),
    endsError: useId(),
  };

  const firstDay = icelandDate(today);
  const latest = new Date(today);
  latest.setUTCMonth(latest.getUTCMonth() + groupCodeRules.maxMonthsAhead);
  // The day before the latest moment, so the end of the chosen day is never past it.
  const lastDay = icelandDate(new Date(latest.getTime() - day));

  const trimmed = name.trim();
  const nameProblem =
    trimmed === ""
      ? t("admin.inviteCodes.nameMissing")
      : trimmed.length > groupCodeRules.nameMaxLength
        ? t("admin.inviteCodes.nameTooLong", { max: groupCodeRules.nameMaxLength })
        : null;
  const count = Number(uses);
  const usesFit =
    uses.trim() !== "" && Number.isInteger(count) && count >= 1 && count <= groupCodeRules.maxUses;
  const endsFit = /^\d{4}-\d{2}-\d{2}$/.test(ends) && ends >= firstDay && ends <= lastDay;

  async function make() {
    setChecked(true);
    setFailed(false);
    if (nameProblem !== null) {
      nameInput.current?.focus();
      return;
    }
    if (!usesFit) {
      usesInput.current?.focus();
      return;
    }
    if (!endsFit) {
      endsInput.current?.focus();
      return;
    }
    setSaving(true);
    const result = await call(adminCreateInviteCodeRoute, {
      body: { name: trimmed, uses: count, expiresAt: endOfDay(ends) },
    });
    setSaving(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setName("");
    setChecked(false);
    onMade(result.data);
  }

  return (
    <form
      className="card stack"
      noValidate
      aria-labelledby={ids.title}
      onSubmit={(event) => {
        event.preventDefault();
        void make();
      }}
    >
      <h2 id={ids.title} className="type-heading">
        {t("admin.inviteCodes.newTitle")}
      </h2>
      <div className="field">
        <label htmlFor={ids.name} className="type-label">
          {t("admin.inviteCodes.name")}
        </label>
        <input
          ref={nameInput}
          id={ids.name}
          className="input type-body"
          value={name}
          aria-invalid={checked && nameProblem !== null}
          aria-describedby={checked && nameProblem !== null ? ids.nameError : undefined}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {checked && nameProblem !== null ? (
          <p id={ids.nameError} className="field-error type-small">
            {nameProblem}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={ids.uses} className="type-label">
          {t("admin.inviteCodes.uses")}
        </label>
        <input
          ref={usesInput}
          id={ids.uses}
          className="input type-body"
          type="number"
          inputMode="numeric"
          min={1}
          max={groupCodeRules.maxUses}
          value={uses}
          aria-invalid={checked && !usesFit}
          aria-describedby={checked && !usesFit ? ids.usesError : undefined}
          onChange={(event) => {
            setUses(event.target.value);
          }}
        />
        {checked && !usesFit ? (
          <p id={ids.usesError} className="field-error type-small">
            {t("admin.inviteCodes.usesWrong", { max: groupCodeRules.maxUses })}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={ids.ends} className="type-label">
          {t("admin.inviteCodes.ends")}
        </label>
        <input
          ref={endsInput}
          id={ids.ends}
          className="input type-body"
          type="date"
          min={firstDay}
          max={lastDay}
          value={ends}
          aria-invalid={checked && !endsFit}
          aria-describedby={checked && !endsFit ? ids.endsError : undefined}
          onChange={(event) => {
            setEnds(event.target.value);
          }}
        />
        {checked && !endsFit ? (
          <p id={ids.endsError} className="field-error type-small">
            {t("admin.inviteCodes.endsWrong", { months: groupCodeRules.maxMonthsAhead })}
          </p>
        ) : null}
      </div>
      {failed ? (
        <p className="problem type-body" role="alert">
          {t("admin.inviteCodes.makeFailed")}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="button-primary type-button" disabled={saving}>
          {t("admin.inviteCodes.make")}
        </button>
      </div>
    </form>
  );
}

function CodeCard({
  code,
  onEnded,
}: {
  readonly code: AdminInviteCode;
  readonly onEnded: () => void;
}) {
  const { t, locale, call } = useConsole();
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const dateOf = (moment: string) => formatDate(icelandDate(new Date(moment)), locale);
  const state =
    code.endedAt !== null
      ? t("admin.inviteCodes.ended", { date: dateOf(code.endedAt) })
      : code.works
        ? t("admin.inviteCodes.worksUntil", { date: dateOf(code.expiresAt) })
        : code.uses >= code.usesAllowed
          ? t("admin.inviteCodes.usedUp")
          : t("admin.inviteCodes.expired", { date: dateOf(code.expiresAt) });

  async function end() {
    setEnding(true);
    setFailed(false);
    const result = await call(adminEndInviteCodeRoute, { params: { id: code.id } });
    setEnding(false);
    // Ended meanwhile, in another window: the list shows it.
    if (result.ok || result.error.code === "already_ended") {
      setConfirming(false);
      onEnded();
    } else setFailed(true);
  }

  return (
    <li className="card stack">
      <h3 className="type-heading">{code.name}</h3>
      <p className="type-body">
        <code>{code.code}</code>
      </p>
      <p className="type-body">
        {t("admin.inviteCodes.used", {
          uses: formatCount(code.uses, locale),
          allowed: formatCount(code.usesAllowed, locale),
        })}{" "}
        {state}
      </p>
      {failed ? (
        <p className="problem type-body" role="alert">
          {t("admin.inviteCodes.endFailed")}
        </p>
      ) : null}
      {code.endedAt !== null ? null : confirming ? (
        <div className="stack">
          <p className="type-body">{t("admin.inviteCodes.endQuestion")}</p>
          <div className="actions">
            <button
              ref={confirmButton}
              type="button"
              className="button-primary type-button"
              disabled={ending}
              onClick={() => void end()}
            >
              {t("admin.inviteCodes.endConfirm", { name: code.name })}
            </button>
            <button
              type="button"
              className="button-quiet type-label"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t("admin.inviteCodes.endCancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            aria-label={t("admin.inviteCodes.endNamed", { name: code.name })}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("admin.inviteCodes.end")}
          </button>
        </div>
      )}
    </li>
  );
}
