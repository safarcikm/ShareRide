import {
  adminAddPasskeyOptionsRoute,
  adminAddPasskeyRoute,
  adminConfirmOptionsRoute,
  adminConfirmRoute,
  adminPasskeysRoute,
  adminRemovePasskeyRoute,
  type Passkey,
} from "@shareride/contracts";
import { passkeyRules } from "@shareride/domain";
import { formatDay, type MessageKey } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../console.tsx";
import { passkeyFailure } from "../webauthn.ts";

type Notice = { readonly kind: "done" | "problem"; readonly text: string };

/** The operator's passkeys: see, add and remove them (ADR 0028). */
export function PasskeysPage() {
  const { t, locale, call, passkeys } = useConsole();
  const [list, setList] = useState<readonly Passkey[] | "loading" | "failed">("loading");
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameMissing, setNameMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const nameId = useId();
  const errorId = useId();
  const nameField = useRef<HTMLInputElement>(null);
  // The question's own button takes the focus; Keep it gives it back to Remove.
  const confirmButton = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusTo = useRef<string | null>(null);

  useEffect(() => {
    if (removing !== null) {
      confirmButton.current?.focus();
    } else if (returnFocusTo.current !== null) {
      removeButtons.current.get(returnFocusTo.current)?.focus();
      returnFocusTo.current = null;
    }
  }, [removing]);

  const load = useCallback(async () => {
    const result = await call(adminPasskeysRoute, {});
    setList(result.ok ? result.data.passkeys : "failed");
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const problem = (key: MessageKey) => {
    setNotice({ kind: "problem", text: t(key) });
  };

  /** Asks for one of the operator's passkeys; changing passkeys needs a recent one. */
  async function confirmItIsYou(): Promise<boolean> {
    const options = await call(adminConfirmOptionsRoute, { body: {} });
    if (!options.ok) {
      problem("admin.error");
      return false;
    }
    let credential;
    try {
      credential = await passkeys.get(options.data.options);
    } catch (error) {
      problem(passkeyFailure(error));
      return false;
    }
    const result = await call(adminConfirmRoute, { body: { credential } });
    if (!result.ok) problem("admin.passkeys.confirmFailed");
    return result.ok;
  }

  async function add() {
    const trimmed = name.trim();
    if (trimmed === "") {
      setNameMissing(true);
      nameField.current?.focus();
      return;
    }
    setNotice(null);
    setBusy(true);
    try {
      let options = await call(adminAddPasskeyOptionsRoute, { body: {} });
      if (!options.ok && options.error.code === "confirmation_required") {
        if (!(await confirmItIsYou())) return;
        options = await call(adminAddPasskeyOptionsRoute, { body: {} });
      }
      if (!options.ok) {
        problem("admin.error");
        return;
      }
      let credential;
      try {
        credential = await passkeys.create(options.data.options);
      } catch (error) {
        problem(passkeyFailure(error));
        return;
      }
      const result = await call(adminAddPasskeyRoute, { body: { credential, name: trimmed } });
      if (!result.ok) {
        problem("admin.passkeys.saveFailed");
        return;
      }
      setName("");
      setNotice({ kind: "done", text: t("admin.passkeys.addedNotice", { name: trimmed }) });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(passkey: Passkey) {
    setNotice(null);
    setBusy(true);
    try {
      const send = () => call(adminRemovePasskeyRoute, { params: { id: passkey.id } });
      let result = await send();
      if (!result.ok && result.error.code === "confirmation_required") {
        if (!(await confirmItIsYou())) return;
        result = await send();
      }
      if (result.ok) {
        setNotice({
          kind: "done",
          text: t("admin.passkeys.removedNotice", { name: passkey.name }),
        });
      } else {
        problem(result.error.code === "last_passkey" ? "admin.passkeys.lastOne" : "admin.error");
      }
      setRemoving(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const day = (moment: string) => formatDay(new Date(moment), locale);

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.passkeys.title")}</h1>
      <p className="type-body muted">{t("admin.passkeys.intro")}</p>
      {notice === null ? null : (
        <p
          className={notice.kind === "done" ? "notice type-body" : "problem type-body"}
          role={notice.kind === "done" ? "status" : "alert"}
        >
          {notice.text}
        </p>
      )}
      {list === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : list === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.passkeys.loadFailed")}
          </p>
          <button type="button" className="button-secondary type-label" onClick={() => void load()}>
            {t("admin.retry")}
          </button>
        </div>
      ) : (
        <ul className="cards">
          {list.map((passkey) => (
            <li key={passkey.id} className="card">
              <div className="card-text">
                <p className="type-body-strong">
                  {passkey.name}
                  {passkey.backedUp ? (
                    <span className="tag type-caption">{t("admin.passkeys.synced")}</span>
                  ) : null}
                </p>
                <p className="type-small muted">
                  {t("admin.passkeys.added", { date: day(passkey.createdAt) })}
                  {" · "}
                  {passkey.lastUsedAt === null
                    ? t("admin.passkeys.neverUsed")
                    : t("admin.passkeys.lastUsed", { date: day(passkey.lastUsedAt) })}
                </p>
              </div>
              {removing === passkey.id ? (
                <div
                  className="confirm-row"
                  role="group"
                  aria-label={t("admin.passkeys.removeQuestion", { name: passkey.name })}
                >
                  <p className="type-small">
                    {t("admin.passkeys.removeQuestion", { name: passkey.name })}
                  </p>
                  <button
                    ref={confirmButton}
                    type="button"
                    className="button-danger type-label"
                    disabled={busy}
                    onClick={() => void remove(passkey)}
                  >
                    {t("admin.passkeys.removeConfirm", { name: passkey.name })}
                  </button>
                  <button
                    type="button"
                    className="button-quiet type-label"
                    onClick={() => {
                      returnFocusTo.current = passkey.id;
                      setRemoving(null);
                    }}
                  >
                    {t("admin.passkeys.keep")}
                  </button>
                </div>
              ) : list.length === 1 ? (
                <p className="type-small muted">{t("admin.passkeys.lastOne")}</p>
              ) : (
                <button
                  ref={(button) => {
                    if (button === null) removeButtons.current.delete(passkey.id);
                    else removeButtons.current.set(passkey.id, button);
                  }}
                  type="button"
                  className="button-secondary type-label"
                  aria-label={t("admin.passkeys.removeLabel", { name: passkey.name })}
                  onClick={() => {
                    setRemoving(passkey.id);
                  }}
                >
                  {t("admin.passkeys.remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="stack panel"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <h2 className="type-heading">{t("admin.passkeys.addTitle")}</h2>
        <div className="field">
          <label htmlFor={nameId} className="type-label">
            {t("admin.setup.name")}
          </label>
          <input
            ref={nameField}
            id={nameId}
            className="input type-body"
            value={name}
            maxLength={passkeyRules.nameMaxLength}
            autoComplete="off"
            aria-invalid={nameMissing}
            aria-describedby={nameMissing ? errorId : undefined}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim() !== "") setNameMissing(false);
            }}
          />
          {nameMissing ? (
            <p id={errorId} className="field-error type-small">
              {t("admin.setup.nameMissing")}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          className="button-primary type-button"
          disabled={busy}
          aria-busy={busy}
        >
          {t("admin.passkeys.add")}
        </button>
      </form>
    </section>
  );
}
