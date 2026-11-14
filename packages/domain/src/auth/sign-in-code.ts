import { err, ok, type Result } from "../result.ts";

/** Sign-in code rules (spec 1, rule R1.2). */
export const codeRules = {
  length: 6,
  validForSeconds: 10 * 60,
  maxAttempts: 5,
} as const;

/**
 * How often a code may be sent (rule R1.3). Per IP address and per country
 * calling code are starting values, tuned with real traffic. The daily cap
 * per country is the SMS budget: it bounds what SMS pumping fraud can cost.
 */
export const codeSendLimits = {
  perNumber: [
    { limit: 1, windowSeconds: 30 },
    { limit: 5, windowSeconds: 3600 },
  ],
  perIpAddress: [{ limit: 10, windowSeconds: 3600 }],
  perCallingCode: (callingCode: string) => {
    const iceland = callingCode === "354";
    return [
      { limit: iceland ? 500 : 50, windowSeconds: 3600 },
      { limit: iceland ? 2000 : 100, windowSeconds: 24 * 3600 },
    ];
  },
} as const;

/**
 * Makes a code from a source of random integers in [0, max). The caller passes
 * a cryptographically secure source; the domain has no randomness of its own.
 */
export function generateCode(randomInt: (max: number) => number): string {
  let code = "";
  for (let i = 0; i < codeRules.length; i++) code += String(randomInt(10));
  return code;
}

export interface CodeState {
  readonly createdAt: Date;
  readonly attempts: number;
  readonly usedAt: Date | null;
}

export type CodeAttemptError =
  { readonly code: "code_expired" } | { readonly code: "code_attempts_exceeded" };

/**
 * Whether one more guess at this code is allowed now. On success, says how
 * many attempts remain after this one.
 */
export function checkCodeAttempt(
  state: CodeState,
  now: Date,
): Result<{ readonly attemptsLeft: number }, CodeAttemptError> {
  const ageSeconds = (now.getTime() - state.createdAt.getTime()) / 1000;
  if (state.usedAt !== null || ageSeconds >= codeRules.validForSeconds) {
    return err({ code: "code_expired" });
  }
  if (state.attempts >= codeRules.maxAttempts) {
    return err({ code: "code_attempts_exceeded" });
  }
  return ok({ attemptsLeft: codeRules.maxAttempts - state.attempts - 1 });
}
