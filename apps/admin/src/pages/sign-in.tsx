import { adminSignInOptionsRoute, adminSignInRoute, type AdminMe } from "@shareride/contracts";
import type { MessageKey } from "@shareride/i18n";
import { useState } from "react";
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
    </main>
  );
}
