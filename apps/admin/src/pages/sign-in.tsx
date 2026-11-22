import {
  adminPasswordSignInRoute,
  adminSignInMethodsRoute,
  adminSignInOptionsRoute,
  adminSignInRoute,
  type AdminMe,
} from "@shareride/contracts";
import type { MessageKey } from "@shareride/i18n";
import { useEffect, useId, useState } from "react";
import { useConsole } from "../console.tsx";
import { passkeyFailure } from "../webauthn.ts";

export interface SignInPageProps {
  /** Why the operator is here: signed out, or the session ended. */
  readonly notice: MessageKey | undefined;
  readonly onSignedIn: (operator: AdminMe) => void;
}

export function SignInPage({ notice, onSignedIn }: SignInPageProps) {
  const { t, call, passkeys } = useConsole();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  // The temporary password sign-in (ADR 0041), shown only while it is on.
  const [passwordOn, setPasswordOn] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const phoneId = useId();
  const passwordId = useId();

  useEffect(() => {
    let current = true;
    void call(adminSignInMethodsRoute, {}).then((result) => {
      if (current && result.ok) setPasswordOn(result.data.password);
    });
    return () => {
      current = false;
    };
  }, [call]);

  async function signInWithPassword() {
    setProblem(null);
    if (phoneNumber.trim() === "" || password === "") {
      setProblem("admin.signIn.passwordMissing");
      return;
    }
    setBusy(true);
    try {
      const result = await call(adminPasswordSignInRoute, {
        body: { phoneNumber: phoneNumber.trim(), password },
      });
      if (result.ok) {
        onSignedIn(result.data);
        return;
      }
      setProblem(
        result.error.code === "password_invalid"
          ? "admin.signIn.passwordWrong"
          : result.error.code === "operator_unavailable"
            ? "admin.signIn.unavailable"
            : result.error.code === "rate_limited"
              ? "admin.signIn.tooManyTries"
              : "admin.error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setProblem(null);
    if (!passkeys.supported()) {
      setProblem("admin.passkey.unsupported");
      return;
    }
    setBusy(true);
    try {
      const options = await call(adminSignInOptionsRoute, { body: {} });
      if (!options.ok) {
        setProblem("admin.error");
        return;
      }
      let credential;
      try {
        credential = await passkeys.get(options.data.options);
      } catch (error) {
        setProblem(passkeyFailure(error));
        return;
      }
      const result = await call(adminSignInRoute, { body: { credential } });
      if (result.ok) {
        onSignedIn(result.data);
        return;
      }
      setProblem(
        result.error.code === "operator_unavailable"
          ? "admin.signIn.unavailable"
          : result.error.code === "passkey_invalid"
            ? "admin.signIn.failed"
            : "admin.error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow stack" id="page">
      <p className="console-name type-heading">{t("admin.title")}</p>
      <h1 className="type-title">{t("admin.signIn.title")}</h1>
      {notice === undefined || problem !== null ? null : (
        <p className="notice type-body" role="status">
          {t(notice)}
        </p>
      )}
      <p className="type-body muted">{t("admin.signIn.body")}</p>
      {problem === null ? null : (
        <p className="problem type-body" role="alert">
          {t(problem)}
        </p>
      )}
      <button
        type="button"
        className="button-primary type-button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void signIn()}
      >
        {t("admin.signIn.button")}
      </button>
      {passwordOn ? (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void signInWithPassword();
          }}
        >
          <h2 className="type-heading">{t("admin.signIn.passwordTitle")}</h2>
          <p className="type-body muted">{t("admin.signIn.passwordBody")}</p>
          <div className="field">
            <label htmlFor={phoneId} className="type-label">
              {t("admin.signIn.phoneNumber")}
            </label>
            <input
              id={phoneId}
              className="input type-body"
              type="text"
              inputMode="tel"
              autoComplete="username"
              value={phoneNumber}
              onChange={(event) => {
                setPhoneNumber(event.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={passwordId} className="type-label">
              {t("admin.signIn.password")}
            </label>
            <input
              id={passwordId}
              className="input type-body"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>
          <button
            type="submit"
            className="button-secondary type-button"
            disabled={busy}
            aria-busy={busy}
          >
            {t("admin.signIn.passwordButton")}
          </button>
        </form>
      ) : null}
    </main>
  );
}
