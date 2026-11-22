import { adminSetupOptionsRoute, adminSetupRoute, type AdminMe } from "@shareride/contracts";
import type { MessageKey } from "@shareride/i18n";
import { passkeyRules } from "@shareride/domain";
import { useId, useRef, useState } from "react";
import { useConsole } from "../console.tsx";
import { passkeyFailure } from "../webauthn.ts";

/**
 * Takes the setup token from after the `#` and removes it from the address
 * at once, so it stays out of the history and is not shared by accident.
 */
function takeToken(): string | null {
  const token = window.location.hash.slice(1);
  if (token === "") return null;
  window.history.replaceState(null, "", window.location.pathname);
  return token;
}

export interface SetupPageProps {
  readonly onSignedIn: (operator: AdminMe) => void;
  /** A setup token from a recovery code (spec 22); without it, the link's. */
  readonly token?: string;
  /** The text above the name, when it is not the setup link's. */
  readonly bodyKey?: MessageKey;
}

/** Saves a passkey with the link from the `operator` command, or after a recovery code. */
export function SetupPage({
  onSignedIn,
  token: given,
  bodyKey = "admin.setup.body",
}: SetupPageProps) {
  const { t, call, passkeys } = useConsole();
  const [token] = useState(() => given ?? takeToken());
  const [name, setName] = useState("");
  const [nameMissing, setNameMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<MessageKey | null>(
    token === null ? "admin.setup.missing" : null,
  );
  const nameField = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const hintId = useId();
  const errorId = useId();

  async function save() {
    if (token === null) return;
    const trimmed = name.trim();
    if (trimmed === "") {
      setNameMissing(true);
      nameField.current?.focus();
      return;
    }
    setProblem(null);
    if (!passkeys.supported()) {
      setProblem("admin.passkey.unsupported");
      return;
    }
    setBusy(true);
    try {
      const options = await call(adminSetupOptionsRoute, { body: { token } });
      if (!options.ok) {
        setProblem(
          options.error.code === "setup_link_invalid" ? "admin.setup.invalid" : "admin.error",
        );
        return;
      }
      let credential;
      try {
        credential = await passkeys.create(options.data.options);
      } catch (error) {
        setProblem(passkeyFailure(error));
        return;
      }
      const result = await call(adminSetupRoute, { body: { token, credential, name: trimmed } });
      if (result.ok) {
        onSignedIn(result.data);
        return;
      }
      setProblem(
        result.error.code === "setup_link_invalid"
          ? "admin.setup.invalid"
          : result.error.code === "passkey_invalid"
            ? "admin.passkeys.saveFailed"
            : "admin.error",
      );
    } finally {
      setBusy(false);
    }
  }

  const describedBy = nameMissing ? `${hintId} ${errorId}` : hintId;
  return (
    <main className="narrow stack" id="page">
      <p className="console-name type-heading">{t("admin.title")}</p>
      <h1 className="type-title">{t("admin.setup.title")}</h1>
      {problem === null ? null : (
        <p className="problem type-body" role="alert">
          {t(problem)}
        </p>
      )}
      {token === null ? null : (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="type-body muted">{t(bodyKey)}</p>
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
              aria-describedby={describedBy}
              aria-invalid={nameMissing}
              onChange={(event) => {
                setName(event.target.value);
                if (event.target.value.trim() !== "") setNameMissing(false);
              }}
            />
            <p id={hintId} className="hint type-small">
              {t("admin.setup.nameHint")}
            </p>
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
            {t("admin.setup.button")}
          </button>
        </form>
      )}
    </main>
  );
}
