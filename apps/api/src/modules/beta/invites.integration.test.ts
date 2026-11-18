import {
  checkInviteCodeRoute,
  startPhoneSignInRoute,
  verifyPhoneCodeRoute,
  type AdminInviteCode,
  type AdminInviteCodes,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { runInviteCommand } from "./invite-command.ts";
import { createInviteService } from "./invites.ts";

// Invite codes and the closed beta's gate (spec 12, 3.2; R12.1 to R12.3;
// milestone 11, PR 3). One database for the whole file; the operator and a
// member join before the gate is on.

let api: TestApi;
let operator: { userId: string; cookie: string };
let member: string;

const device = { platform: "ios", name: "Test phone", appVersion: "1.0.0" } as const;
const day = 24 * 60 * 60;

beforeAll(async () => {
  api = await startTestApi();
  operator = await api.signInOperator();
  member = api.newPhoneNumber();
  await api.signIn(member);
  api.useStoredInviteSetting();
});

afterAll(async () => {
  await api.close();
});

async function send(method: string, path: string, body?: unknown, cookie = operator.cookie) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const codeOf = (body: unknown) => (body as { error: { code: string } }).error.code;
const later = (seconds: number) => new Date(api.now().getTime() + seconds * 1000).toISOString();

async function makeCode(uses = 20, name = "Carpool at work", ends = 30 * day) {
  const made = await send("POST", "/admin/v1/invite-codes", {
    name,
    uses,
    expiresAt: later(ends),
  });
  expect(made.status).toBe(201);
  return made.body as AdminInviteCode;
}

const overview = async () => (await send("GET", "/admin/v1/invite-codes")).body as AdminInviteCodes;

let addresses = 0;

/** Asks for a text-message code for a number, from a new address, 31 seconds later. */
async function start(phoneNumber: string) {
  api.advance(31);
  addresses += 1;
  api.ip = `203.0.113.${String(addresses % 250)}`;
  const started = await api.client.call(startPhoneSignInRoute, {
    body: { phoneNumber, locale: "en" },
  });
  expect(started.ok).toBe(true);
  return api.lastCode(phoneNumber);
}

const verify = (phoneNumber: string, code: string, inviteCode?: string) =>
  api.client.call(verifyPhoneCodeRoute, {
    body: { phoneNumber, code, locale: "en", device, ...(inviteCode ? { inviteCode } : {}) },
  });

const accountOf = async (phoneNumber: string) => {
  const [user] = await api.connection.db
    .select({ id: schema.users.id, inviteCodeId: schema.users.inviteCodeId })
    .from(schema.users)
    .where(eq(schema.users.phoneE164, phoneNumber));
  return user;
};

async function setSetting(key: string, value: number) {
  const { version } = (await send("GET", "/admin/v1/settings")).body as { version: number };
  const changed = await send("PATCH", `/admin/v1/settings/${key}`, {
    value,
    reason: "For a test",
    version,
  });
  expect(changed.status).toBe(200);
}

describe("the operator's group codes", () => {
  it("are made with a code of 8 clear characters, and listed newest first with the places left", async () => {
    const first = await makeCode(20, "  Carpool at work ");
    const second = await makeCode(5, "Climbing club");
    expect(first.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(first).toMatchObject({
      kind: "group",
      name: "Carpool at work",
      usesAllowed: 20,
      uses: 0,
      endedAt: null,
      works: true,
    });

    const all = await overview();
    expect(all).toMatchObject({ required: true, testers: 0, maxTesters: 150, placesLeft: 150 });
    expect(all.codes.slice(0, 2).map((code) => code.id)).toEqual([second.id, first.id]);
  });

  it("refuse a draft that breaks the rules, naming the field", async () => {
    const cases = [
      [{ name: " ", uses: 5, expiresAt: later(day) }, "name", "missing"],
      [{ name: "a".repeat(81), uses: 5, expiresAt: later(day) }, "name", "too_long"],
      [{ name: "Club", uses: 0, expiresAt: later(day) }, "uses", "out_of_range"],
      [{ name: "Club", uses: 501, expiresAt: later(day) }, "uses", "out_of_range"],
      [{ name: "Club", uses: 5, expiresAt: later(-1) }, "expiresAt", "in_past"],
      [{ name: "Club", uses: 5, expiresAt: later(400 * day) }, "expiresAt", "too_far"],
    ] as const;
    for (const [body, path, issue] of cases) {
      const refused = await send("POST", "/admin/v1/invite-codes", body);
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({
        error: { code: "validation_failed", details: [{ path, issue }] },
      });
    }
  });

  it("can be ended once, and each step is in the audit log", async () => {
    const code = await makeCode(3, "Ends early");
    const ended = await send("POST", `/admin/v1/invite-codes/${code.id}/end`);
    expect(ended.status).toBe(200);
    expect(ended.body).toMatchObject({ id: code.id, works: false });
    expect((ended.body as AdminInviteCode).endedAt).not.toBeNull();

    const again = await send("POST", `/admin/v1/invite-codes/${code.id}/end`);
    expect([again.status, codeOf(again.body)]).toEqual([409, "already_ended"]);
    const missing = await send(
      "POST",
      "/admin/v1/invite-codes/00000000-0000-7000-8000-000000000000/end",
    );
    expect([missing.status, codeOf(missing.body)]).toEqual([404, "not_found"]);

    const entries = await api.connection.db
      .select({ action: schema.auditLog.action, operator: schema.auditLog.operatorUserId })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subjectId, code.id));
    expect(entries.map((entry) => entry.action).sort()).toEqual([
      "invite_code.created",
      "invite_code.ended",
    ]);
    expect(entries.every((entry) => entry.operator === operator.userId)).toBe(true);
  });

  it("are for operators only", async () => {
    const listed = await send("GET", "/admin/v1/invite-codes", undefined, "");
    expect(listed.status).toBe(401);
    const made = await send("POST", "/admin/v1/invite-codes", { name: "x", uses: 1 }, "");
    expect(made.status).toBe(401);
  });
});

describe("signing up while the beta is closed (R12.1)", () => {
  it("refuses a new number without an invite code, makes no account and keeps the text-message code", async () => {
    const { code: invite } = await makeCode();
    const phone = api.newPhoneNumber();
    const sms = await start(phone);

    for (let tries = 0; tries < 7; tries += 1) {
      const refused = await verify(phone, sms);
      expect(refused).toMatchObject({
        ok: false,
        status: 403,
        error: { code: "invite_required" },
      });
    }
    expect(await accountOf(phone)).toBeUndefined();

    // The same text-message code still works, now with the invite code.
    const joined = await verify(phone, sms, invite);
    expect(joined).toMatchObject({ ok: true, data: { isNewUser: true } });
  });

  it("creates the account with a good code, typed any way, and counts the use and the tester", async () => {
    const invite = await makeCode(2, "Counted");
    const before = await overview();
    const phone = api.newPhoneNumber();
    const typed = ` ${invite.code.slice(0, 4).toLowerCase()}-${invite.code.slice(4)} `;
    const joined = await verify(phone, await start(phone), typed);
    expect(joined.ok).toBe(true);

    expect((await accountOf(phone))?.inviteCodeId).toBe(invite.id);
    const after = await overview();
    expect(after.testers).toBe(before.testers + 1);
    expect(after.placesLeft).toBe(before.placesLeft - 1);
    expect(after.codes.find((code) => code.id === invite.id)?.uses).toBe(1);
  });

  it("never asks a member for one", async () => {
    const signedIn = await verify(member, await start(member));
    expect(signedIn).toMatchObject({ ok: true, data: { isNewUser: false } });
    expect((await accountOf(member))?.inviteCodeId).toBeNull();
  });

  it("counts a wrong invite code as a wrong try, so guessing is held to the tries of sign-in", async () => {
    const { code: invite } = await makeCode();
    const phone = api.newPhoneNumber();
    const sms = await start(phone);

    for (const guess of ["ZZZZ9999", "not a code", "ZZZZ9998", "ZZZZ9997", "ZZZZ9996"]) {
      const refused = await verify(phone, sms, guess);
      expect(refused).toMatchObject({ ok: false, status: 400, error: { code: "invite_invalid" } });
    }
    // Five tries are gone: even the right pair is refused now.
    const exhausted = await verify(phone, sms, invite);
    expect(exhausted).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "code_attempts_exceeded" },
    });
    expect(await accountOf(phone)).toBeUndefined();

    const joined = await verify(phone, await start(phone), invite);
    expect(joined.ok).toBe(true);
  });

  it("checks the text-message code first, so an invite code is never tested without it", async () => {
    const { code: invite } = await makeCode();
    const phone = api.newPhoneNumber();
    const sms = await start(phone);
    const refused = await verify(phone, sms === "000000" ? "111111" : "000000", invite);
    expect(refused).toMatchObject({ ok: false, error: { code: "code_invalid" } });
  });

  it("gives one answer for an unknown, ended, expired and used-up code", async () => {
    const ended = await makeCode(5, "Ended");
    await send("POST", `/admin/v1/invite-codes/${ended.id}/end`);
    const short = await makeCode(5, "Short", 60);
    const single = await makeCode(1, "Single");
    const first = api.newPhoneNumber();
    expect((await verify(first, await start(first), single.code)).ok).toBe(true);

    // `start` moves the clock 31 seconds each time, past the short code's end.
    for (const invite of ["ABCD2345", ended.code, short.code, single.code]) {
      const phone = api.newPhoneNumber();
      const refused = await verify(phone, await start(phone), invite);
      expect(refused).toMatchObject({ ok: false, status: 400, error: { code: "invite_invalid" } });
      expect(await accountOf(phone)).toBeUndefined();
    }
  });

  it("makes one account when two sign-ups use a one-use code at the same moment", async () => {
    const single = await makeCode(1, "Race");
    const phones = [api.newPhoneNumber(), api.newPhoneNumber()] as const;
    const codes = [await start(phones[0]), await start(phones[1])] as const;
    const results = await Promise.all([
      verify(phones[0], codes[0], single.code),
      verify(phones[1], codes[1], single.code),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error: { code: "invite_invalid" },
    });
    const all = await overview();
    expect(all.codes.find((code) => code.id === single.id)?.uses).toBe(1);
  });
});

describe("the tester cap (R12.3)", () => {
  it("holds when two codes are used at once for the last place, and frees a place when raised", async () => {
    const [{ count: testers }] = [
      {
        count: (
          await api.connection.db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(isNotNull(schema.users.inviteCodeId))
        ).length,
      },
    ];
    await setSetting("beta_max_testers", testers + 1);
    const invites = [await makeCode(5, "One"), await makeCode(5, "Two")] as const;
    const phones = [api.newPhoneNumber(), api.newPhoneNumber()] as const;
    const codes = [await start(phones[0]), await start(phones[1])] as const;

    const results = await Promise.all([
      verify(phones[0], codes[0], invites[0].code),
      verify(phones[1], codes[1], invites[1].code),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const full = results.find((result) => !result.ok);
    expect(full).toMatchObject({ status: 409, error: { code: "beta_full" } });
    expect(await overview()).toMatchObject({ testers: testers + 1, placesLeft: 0 });

    // A full beta is no wrong try: with a place, the same pair works.
    await setSetting("beta_max_testers", 150);
    const loser = results[0].ok ? 1 : 0;
    const joined = await verify(phones[loser], codes[loser], invites[loser].code);
    expect(joined.ok).toBe(true);
  });
});

describe("checking a code before sign-up", () => {
  const check = (code: string) => api.client.call(checkInviteCodeRoute, { body: { code } });

  it("says whether a code would work, without using it", async () => {
    const invite = await makeCode(1, "Checked");
    api.ip = "203.0.113.251";
    expect(await check(invite.code.toLowerCase())).toMatchObject({
      ok: true,
      data: { valid: true },
    });
    expect(await check("ABCD2345")).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "invite_invalid" },
    });
    const all = await overview();
    expect(all.codes.find((code) => code.id === invite.id)?.uses).toBe(0);
  });

  it("is limited to 10 a minute per address", async () => {
    api.ip = "203.0.113.252";
    for (let tries = 0; tries < 10; tries += 1) {
      expect((await check("ABCD2345")).status).toBe(400);
    }
    expect(await check("ABCD2345")).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited" },
    });
    api.advance(61);
    expect((await check("ABCD2345")).status).toBe(400);
  });
});

describe("the invite command", () => {
  it("prints a new group code that works, with no audit entry and nobody as its maker", async () => {
    const lines: string[] = [];
    const invites = createInviteService({
      db: api.connection.db,
      clock: () => api.now(),
      settings: {
        current: () => Promise.reject(new Error("not read")),
        latest: () => Promise.reject(new Error("not read")),
      },
      randomInt: () => 3,
    });
    const exit = await runInviteCommand(["add", "First testers", "10", "14"], {
      invites,
      clock: () => api.now(),
      write: (line) => lines.push(line),
    });
    expect(exit).toBe(0);
    expect(lines[0]).toBe('Invite code DDDDDDDD for "First testers":');
    const [stored] = await api.connection.db
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.code, "DDDDDDDD"));
    expect(stored).toMatchObject({ usesAllowed: 10, createdBy: null, kind: "group" });
    expect(stored?.expiresAt.toISOString()).toBe(later(14 * day));

    const phone = api.newPhoneNumber();
    expect((await verify(phone, await start(phone), "dddd-dddd")).ok).toBe(true);
  });

  it("explains itself when the arguments are wrong", async () => {
    const lines: string[] = [];
    const exit = await runInviteCommand(["add", "No uses"], {
      invites: { create: () => Promise.reject(new Error("not called")) },
      clock: () => api.now(),
      write: (line) => lines.push(line),
    });
    expect(exit).toBe(1);
    expect(lines.join("\n")).toContain("Usage:");
  });
});

describe("with the requirement off", () => {
  it("signs up without a code and records none", async () => {
    await setSetting("invite_code_required", 0);
    const phone = api.newPhoneNumber();
    const joined = await verify(phone, await start(phone));
    expect(joined).toMatchObject({ ok: true, data: { isNewUser: true } });
    expect((await accountOf(phone))?.inviteCodeId).toBeNull();
    expect((await overview()).required).toBe(false);
    expect(
      await api.client.call(checkInviteCodeRoute, { body: { code: "anything" } }),
    ).toMatchObject({ ok: true });
  });
});
