import { describe, expect, it } from "vitest";
import {
  canUseConsole,
  checkOperatorSession,
  operatorSessionEndsAt,
  operatorSessionRules,
} from "./operator.ts";

const startedAt = new Date("2026-11-16T08:00:00Z");
const minutes = (count: number) => new Date(startedAt.getTime() + count * 60_000);

describe("canUseConsole", () => {
  it("lets an active account with the operator role in", () => {
    expect(canUseConsole({ roles: ["operator"], status: "active" })).toBe(true);
  });

  it("refuses an account without the role", () => {
    expect(canUseConsole({ roles: [], status: "active" })).toBe(false);
    expect(canUseConsole({ roles: ["driver"], status: "active" })).toBe(false);
  });

  it("refuses a suspended operator", () => {
    expect(canUseConsole({ roles: ["operator"], status: "suspended" })).toBe(false);
  });
});

describe("checkOperatorSession", () => {
  const session = { startedAt, lastUsedAt: startedAt, endedAt: null };

  it("is live until 30 minutes without use", () => {
    expect(checkOperatorSession(session, minutes(29))).toBe("live");
    expect(checkOperatorSession(session, minutes(30))).toBe("idle");
  });

  it("stays live while it is used, up to 12 hours after sign-in", () => {
    const used = { ...session, lastUsedAt: minutes(12 * 60 - 1) };
    expect(checkOperatorSession(used, minutes(12 * 60 - 1))).toBe("live");
    expect(checkOperatorSession(used, minutes(12 * 60))).toBe("expired");
  });

  it("is over once ended, whatever the time", () => {
    const ended = { ...session, endedAt: minutes(1) };
    expect(checkOperatorSession(ended, minutes(2))).toBe("ended");
  });

  it("matches the rules' numbers", () => {
    expect(operatorSessionRules.idleSeconds).toBe(30 * 60);
    expect(operatorSessionRules.maxSeconds).toBe(12 * 3600);
  });
});

describe("operatorSessionEndsAt", () => {
  it("is 30 minutes after the last use", () => {
    expect(operatorSessionEndsAt({ startedAt, lastUsedAt: minutes(60) })).toEqual(minutes(90));
  });

  it("is never later than 12 hours after sign-in", () => {
    expect(operatorSessionEndsAt({ startedAt, lastUsedAt: minutes(12 * 60 - 10) })).toEqual(
      minutes(12 * 60),
    );
  });
});
