import { schema, type Database } from "@shareride/db";
import {
  canUseConsole,
  err,
  normalisePhoneNumber,
  ok,
  recoveryCodeSendLimits,
  type Result,
} from "@shareride/domain";
import { eq } from "drizzle-orm";
import type { AuthService, ConfirmError, StartError } from "../auth/service.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { recordAudit, type AuditRequest } from "./audit.ts";
import type { PasskeyService } from "./passkeys.ts";
import type { OperatorSessionService } from "./sessions.ts";

const { users } = schema;

export type RecoveryCodeError = { readonly code: "phone_invalid" } | StartError;
export type RecoveryVerifyError = { readonly code: "phone_invalid" } | ConfirmError;

/**
 * "Lost your passkey?" (spec 22, ADR 0040): a text code to an operator's
 * own number, which gives a setup link for a new passkey.
 */
export interface RecoveryService {
  /**
   * Sends a recovery code when the number belongs to an account that may use
   * the console. The answer is the same for any other valid number (R22.2).
   */
  sendCode(input: {
    readonly phoneNumber: string;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, RecoveryCodeError>>;
  /**
   * Checks the code and, in one transaction, ends the account's console
   * sessions, makes a setup link, audits and tells the operator (R22.3,
   * R22.4). Answers with the setup link's token.
   */
  verify(input: {
    readonly phoneNumber: string;
    readonly code: string;
    readonly request: AuditRequest;
  }): Promise<Result<{ readonly token: string }, RecoveryVerifyError>>;
}

export interface RecoveryServiceDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly auth: Pick<AuthService, "sendRecoveryCode" | "withRecoveryCode">;
  readonly passkeys: Pick<PasskeyService, "createSetupLink">;
  readonly sessions: Pick<OperatorSessionService, "endAllOf">;
}

/** What "Send a new code" waits for, whether or not a code was sent. */
const resendAfterSeconds = recoveryCodeSendLimits.perNumber[0].windowSeconds;

/** A number as typed, read as Icelandic without a country code (R1.1). */
function e164Of(phoneNumber: string): string | null {
  const parsed = normalisePhoneNumber(phoneNumber);
  return parsed.ok ? parsed.value.e164 : null;
}

export function createRecoveryService(dependencies: RecoveryServiceDependencies): RecoveryService {
  const { db, clock, auth, passkeys, sessions } = dependencies;

  return {
    async sendCode({ phoneNumber }) {
      const e164 = e164Of(phoneNumber);
      if (e164 === null) return err({ code: "phone_invalid" });
      const [account] = await db
        .select({
          roles: users.roles,
          status: users.status,
          deleteAfter: users.deleteAfter,
          locale: users.locale,
        })
        .from(users)
        .where(eq(users.phoneE164, e164));
      if (account === undefined || !canUseConsole(account)) return ok({ resendAfterSeconds });
      return auth.sendRecoveryCode({ e164, locale: account.locale === "is" ? "is" : "en" });
    },

    async verify({ phoneNumber, code, request }) {
      const e164 = e164Of(phoneNumber);
      if (e164 === null) return err({ code: "phone_invalid" });
      return auth.withRecoveryCode(e164, code, async (tx) => {
        // A share lock: the `operator` command's removal waits for this
        // transaction, or this one waits for it and sees the role gone.
        const [account] = await tx
          .select({
            id: users.id,
            roles: users.roles,
            status: users.status,
            deleteAfter: users.deleteAfter,
          })
          .from(users)
          .where(eq(users.phoneE164, e164))
          .for("share");
        if (account === undefined || !canUseConsole(account)) {
          return err({ code: "code_expired" as const });
        }
        await sessions.endAllOf(account.id, "recovered", tx);
        const { token } = await passkeys.createSetupLink(account.id, tx);
        await recordAudit(tx, {
          operator: { userId: account.id, sessionId: null },
          action: "operator.recovered",
          subjectType: "user",
          subjectId: account.id,
          request,
        });
        await recordEvents(tx, [{ type: "ConsoleRecovered", userId: account.id }], clock());
        return ok({ token });
      });
    },
  };
}
