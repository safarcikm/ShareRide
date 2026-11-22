import { createHash, timingSafeEqual } from "node:crypto";
import { schema, type Database } from "@shareride/db";
import { canUseConsole, err, normalisePhoneNumber, ok, type Result } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { recordAudit, type AuditRequest } from "./audit.ts";
import type { SignedInOperator } from "./passkeys.ts";
import type { OperatorSessionService } from "./sessions.ts";

const { users } = schema;

export type PasswordSignInError =
  | { readonly code: "password_sign_in_off" }
  | { readonly code: "password_invalid" }
  | { readonly code: "operator_unavailable" };

/** The console's temporary password sign-in (ADR 0041). */
export interface PasswordSignIn {
  /** Whether ADMIN_PASSWORD is set. */
  readonly on: boolean;
  /**
   * Signs in the operator whose phone number this is, when the password is
   * right. A wrong password is refused before the number is looked up.
   */
  signIn(input: {
    readonly phoneNumber: string;
    readonly password: string;
    readonly request: AuditRequest;
  }): Promise<Result<SignedInOperator, PasswordSignInError>>;
}

export interface PasswordSignInDependencies {
  readonly db: Database;
  readonly sessions: OperatorSessionService;
  /** ADMIN_PASSWORD; undefined turns password sign-in off. */
  readonly password: string | undefined;
}

/** Compares two passwords in time that does not depend on where they differ. */
export function passwordMatches(expected: string, given: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(expected), digest(given));
}

export function createPasswordSignIn(dependencies: PasswordSignInDependencies): PasswordSignIn {
  const { db, sessions, password } = dependencies;

  return {
    on: password !== undefined,

    async signIn(input) {
      if (password === undefined) return err({ code: "password_sign_in_off" });
      if (!passwordMatches(password, input.password)) return err({ code: "password_invalid" });
      const phone = normalisePhoneNumber(input.phoneNumber);
      if (!phone.ok) return err({ code: "password_invalid" });
      return db.transaction(async (tx) => {
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
          .where(eq(users.phoneE164, phone.value.e164))
          .for("share");
        if (account === undefined || !canUseConsole(account)) {
          return err({ code: "operator_unavailable" } as const);
        }
        const session = await sessions.start(
          { userId: account.id, device: input.request.userAgent },
          tx,
        );
        await recordAudit(tx, {
          operator: { userId: account.id, sessionId: session.sessionId },
          action: "operator.signed_in",
          subjectType: "operator_session",
          subjectId: session.sessionId,
          after: { method: "password" },
          request: input.request,
        });
        return ok({ userId: account.id, session });
      });
    },
  };
}
