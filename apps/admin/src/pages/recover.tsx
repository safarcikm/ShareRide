import {
  adminRecoveryCodeRoute,
  adminRecoveryVerifyRoute,
  type AdminMe,
} from "@shareride/contracts";
import { formatDuration, type MessageKey, type MessageValues } from "@shareride/i18n";
import { useEffect, useId, useState } from "react";
import { ConsoleLink } from "../components/console-link.tsx";
import { useConsole } from "../console.tsx";
import { signInPath } from "../paths.ts";
import { SetupPage } from "./setup.tsx";

export interface RecoverPageProps {
  readonly onSignedIn: (operator: AdminMe) => void;
}

interface Problem {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}

/**
 * "Lost your passkey?" (spec 22): a code by text to the operator's own
 * number, then a new passkey. The setup token stays in this page's memory,
 * never in the address.
 */
export function RecoverPage({ onSignedIn }: RecoverPageProps) {
  const { t, call, locale } = useConsole();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const phoneId = useId();
  const phoneHintId = useId();
  const codeId = useId();

  // Ticks until "Send a new code" works again.
  useEffect(() => {
    if (!sent || now >= resendAt) return undefined;
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, resendAt - now);
    return () => {
      clearTimeout(timer);
    };
  }, [sent, now, resendAt]);

  const wait = (seconds: number | undefined) => ({
    wait: formatDuration(seconds ?? 60, locale),
  });

  async function sendCode() {
    setProblem(null);
    setBusy(true);
    try {
      const result = await call(adminRecoveryCodeRoute, {
        body: { phoneNumber: phoneNumber.trim() },
      });
      if (result.ok) {
        setSent(true);
        setCode("");
        const at = Date.now();
        setNow(at);
        setResendAt(at + result.data.resendAfterSeconds * 1000);
        return;
      }
      const { error } = result;
      setProblem(
        error.code === "phone_invalid" || error.code === "validation_failed"
          ? { key: "error.phone_invalid" }
          : error.code === "rate_limited"
            ? { key: "error.rate_limited", values: wait(error.retryAfterSeconds) }
            : error.code === "sms_failed"
              ? { key: "error.sms_failed" }
              : { key: "admin.error" },
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkCode() {
    setProblem(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setProblem({ key: "auth.code.incomplete", values: { length: 6 } });
      return;
    }
    setBusy(true);
    try {
      const result = await call(adminRecoveryVerifyRoute, {
        body: { phoneNumber: phoneNumber.trim(), code: code.trim() },
      });
      if (result.ok) {
        setToken(result.data.token);
        return;
      }
      const { error } = result;
      setProblem(
        error.code === "code_invalid"
          ? { key: "error.code_invalid", values: { attemptsLeft: error.attemptsLeft ?? 0 } }
          : error.code === "code_expired"
            ? { key: "error.code_expired" }
            : error.code === "code_attempts_exceeded"
              ? { key: "error.code_attempts_exceeded_now" }
              : error.code === "rate_limited"
                ? { key: "error.rate_limited", values: wait(error.retryAfterSeconds) }
                : { key: "admin.error" },
      );
    } finally {
      setBusy(false);
    }
  }

  if (token !== null) {
    return <SetupPage token={token} bodyKey="admin.recover.setupBody" onSignedIn={onSignedIn} />;
  }

  const canResend = now >= resendAt;
  return (
    <main className="narrow stack" id="page">
      <p className="console-name type-heading">{t("admin.title")}</p>
      <h1 className="type-title">{t("admin.recover.title")}</h1>
      {problem === null ? null : (
        <p className="problem type-body" role="alert">
          {t(problem.key, problem.values)}
        </p>
      )}
      {sent ? (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void checkCode();
          }}
        >
          <p className="notice type-body" role="status">
            {t("admin.recover.sent")}
          </p>
          <div className="field">
            <label htmlFor={codeId} className="type-label">
              {t("admin.recover.code")}
            </label>
            <input
              id={codeId}
              className="input type-body"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </div>
          <button
            type="submit"
            className="button-primary type-button"
            disabled={busy}
            aria-busy={busy}
          >
            {t("admin.recover.check")}
          </button>
          <button
            type="button"
            className="button-secondary type-button"
            disabled={busy || !canResend}
            onClick={() => void sendCode()}
          >
            {t("admin.recover.resend")}
          </button>
          <p className="type-body muted">{t("admin.recover.noText")}</p>
        </form>
      ) : (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <div className="field">
            <label htmlFor={phoneId} className="type-label">
              {t("admin.recover.phone")}
            </label>
            <input
              id={phoneId}
              className="input type-body"
              type="text"
              inputMode="tel"
              autoComplete="tel"
              aria-describedby={phoneHintId}
              value={phoneNumber}
              onChange={(event) => {
                setPhoneNumber(event.target.value);
              }}
            />
            <p id={phoneHintId} className="hint type-small">
              {t("admin.recover.phoneHint")}
            </p>
          </div>
          <button
            type="submit"
            className="button-primary type-button"
            disabled={busy}
            aria-busy={busy}
          >
            {t("admin.recover.send")}
          </button>
        </form>
      )}
      <ConsoleLink to={signInPath} className="type-body">
        {t("admin.recover.back")}
      </ConsoleLink>
    </main>
  );
}
