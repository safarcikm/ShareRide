import {
  adminMeRoute,
  adminRecoveryCodeRoute,
  adminRecoveryVerifyRoute,
  adminSetupOptionsRoute,
  adminSetupRoute,
  startPhoneSignInRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { operatorRole } from "@shareride/domain";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, testAdminOrigin, type TestApi } from "../../testing.ts";
import { createOperatorSessionService } from "./sessions.ts";
import { createTestAuthenticator } from "./testing-authenticator.ts";

// "Lost your passkey?" (spec 22): a text code to an operator's own number,
// then a new passkey with a setup link.

let api: TestApi;
let addresses = 0;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

/** A fresh network address, so the limits per address of one test do not reach the next. */
function newAddress() {
  addresses += 1;
  api.ip = `203.0.113.${String(addresses % 250)}`;
}

async function post(path: string, body: unknown, cookie?: string) {
  const response = await api.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Firefox on Linux",
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text === "" ? null : JSON.parse(text)) as Record<string, unknown> & {
      token?: string;
      options?: { challenge: string; user?: { id: string } };
      error?: { code: string };
    },
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null,
  };
}

/** An account with the operator role and a console session, and its number. */
async function newOperator(change: Partial<typeof schema.users.$inferInsert> = {}) {
  const phone = api.newPhoneNumber();
  const { userId } = await api.signIn(phone);
  await api.connection.db
    .update(schema.users)
    .set({ roles: [operatorRole], ...change })
    .where(eq(schema.users.id, userId));
  const session = await createOperatorSessionService(api.features).start({
    userId,
    device: "Test browser",
  });
  newAddress();
  return { userId, phone, cookie: `sr_operator=${session.token}` };
}

const sendCode = (phoneNumber: string) => post(adminRecoveryCodeRoute.path, { phoneNumber });
const verify = (phoneNumber: string, code: string) =>
  post(adminRecoveryVerifyRoute.path, { phoneNumber, code });

/** Sends a code to the operator's number and checks it, as the page does. */
async function recover(phone: string) {
  expect((await sendCode(phone)).status).toBe(200);
  return verify(phone, api.lastCode(phone));
}

async function auditActions(userId: string) {
  const { rows } = await api.connection.pool.query<{ action: string }>(
    "SELECT action FROM audit_log WHERE operator_user_id = $1 ORDER BY created_at, id",
    [userId],
  );
  return rows.map((row) => row.action);
}

async function setupLinksOf(userId: string) {
  const [row] = await api.connection.db
    .select({ links: count() })
    .from(schema.operatorSetupLinks)
    .where(eq(schema.operatorSetupLinks.userId, userId));
  return row?.links ?? 0;
}

async function recoveredEventsOf(userId: string) {
  const rows = await api.connection.db
    .select({ payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(eq(schema.outboxEvents.kind, "ConsoleRecovered"));
  return rows.filter((row) => row.payload.userId === userId).length;
}

describe("sending a recovery code (spec 22, 3.2)", () => {
  it("sends a code to an operator's number, typed without the country code", async () => {
    const { phone } = await newOperator();
    const sent = await sendCode(phone.replace("+354", ""));
    expect(sent).toMatchObject({ status: 200, body: { resendAfterSeconds: 30 } });
    expect(api.sms.outbox.at(-1)?.to).toBe(phone);
    expect(api.sms.outbox.at(-1)?.text).toMatch(/^\d{6} is your PuffinRide console code/);
  });

  it("answers the same and sends nothing for a member, a suspended operator or one waiting to be deleted", async () => {
    const member = api.newPhoneNumber();
    await api.signIn(member);
    const suspended = await newOperator({ status: "suspended" });
    const leaving = await newOperator({ deleteAfter: new Date("2027-01-01T00:00:00Z") });
    const nobody = api.newPhoneNumber();
    newAddress();
    const before = api.sms.outbox.length;
    for (const phone of [member, suspended.phone, leaving.phone, nobody]) {
      expect(await sendCode(phone)).toMatchObject({
        status: 200,
        body: { resendAfterSeconds: 30 },
      });
    }
    expect(api.sms.outbox.length).toBe(before);
  });

  it("refuses a number that is not a phone number", async () => {
    newAddress();
    expect(await sendCode("12")).toMatchObject({
      status: 400,
      body: { error: { code: "phone_invalid" } },
    });
  });

  it("limits each address at both steps", async () => {
    newAddress();
    for (let tries = 0; tries < 5; tries += 1) {
      expect((await sendCode(api.newPhoneNumber())).status).toBe(200);
      expect((await verify(api.newPhoneNumber(), "123456")).status).toBe(400);
    }
    expect(await sendCode(api.newPhoneNumber())).toMatchObject({
      status: 429,
      body: { error: { code: "rate_limited" } },
    });
  });

  it("refuses a second code within 30 seconds", async () => {
    const { phone } = await newOperator();
    await sendCode(phone);
    expect(await sendCode(phone)).toMatchObject({
      status: 429,
      body: { error: { code: "rate_limited", retryAfterSeconds: 30 } },
    });
  });

  it("says when the text could not be sent", async () => {
    const { phone } = await newOperator();
    api.smsFailure = new Error("refused");
    try {
      expect(await sendCode(phone)).toMatchObject({
        status: 503,
        body: { error: { code: "sms_failed" } },
      });
    } finally {
      api.smsFailure = null;
    }
  });
});

describe("checking a recovery code (spec 22, 3.3 and 3.4)", () => {
  it("a right code ends the console sessions, makes a setup link, audits and tells the operator", async () => {
    const { userId, phone, cookie } = await newOperator();
    expect((await api.request(adminMeRoute.path, { headers: { cookie } })).status).toBe(200);

    const checked = await recover(phone);
    expect(checked.status).toBe(200);
    expect(checked.body.token).toMatch(/^sr_ol_/);
    // R22.3: no session cookie yet.
    expect(checked.cookie).toBeNull();

    expect((await api.request(adminMeRoute.path, { headers: { cookie } })).status).toBe(401);
    expect(await post(adminSetupOptionsRoute.path, { token: checked.body.token })).toMatchObject({
      status: 200,
    });
    expect(await auditActions(userId)).toEqual(["operator.recovered"]);
    expect(await recoveredEventsOf(userId)).toBe(1);
  });

  it("the token saves a passkey and signs in", async () => {
    const { userId, phone } = await newOperator();
    const { body } = await recover(phone);
    const token = body.token ?? "";
    const options = await post(adminSetupOptionsRoute.path, { token });
    const authenticator = createTestAuthenticator({ origin: testAdminOrigin });
    const credential = authenticator.register(options.body.options ?? { challenge: "" });
    const saved = await post(adminSetupRoute.path, { token, credential, name: "Phone" });
    expect(saved).toMatchObject({ status: 200, body: { userId } });
    const me = await api.request(adminMeRoute.path, { headers: { cookie: saved.cookie ?? "" } });
    expect(me.status).toBe(200);
  });

  it("counts a wrong code and says how many tries are left", async () => {
    const { phone } = await newOperator();
    await sendCode(phone);
    const code = api.lastCode(phone) === "000000" ? "111111" : "000000";
    expect(await verify(phone, code)).toMatchObject({
      status: 400,
      body: { error: { code: "code_invalid", attemptsLeft: 4 } },
    });
  });

  it("refuses a code once the role was removed", async () => {
    const { userId, phone } = await newOperator();
    await sendCode(phone);
    await api.connection.db
      .update(schema.users)
      .set({ roles: [] })
      .where(eq(schema.users.id, userId));
    expect(await verify(phone, api.lastCode(phone))).toMatchObject({
      status: 400,
      body: { error: { code: "code_expired" } },
    });
    expect(await setupLinksOf(userId)).toBe(0);
    expect(await auditActions(userId)).toEqual([]);
  });

  it("two right answers at once make one setup link", async () => {
    const { userId, phone } = await newOperator();
    await sendCode(phone);
    const code = api.lastCode(phone);
    const answers = await Promise.all([verify(phone, code), verify(phone, code)]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 400]);
    expect(await setupLinksOf(userId)).toBe(1);
    expect(await auditActions(userId)).toEqual(["operator.recovered"]);
    expect(await recoveredEventsOf(userId)).toBe(1);
  });

  it("does not take the number's sign-in code", async () => {
    const { phone } = await newOperator();
    api.advance(31);
    await api.client.call(startPhoneSignInRoute, {
      body: { phoneNumber: phone, locale: "en", pendingSignIn: await api.waitingEmailSignIn() },
    });
    expect(await verify(phone, api.lastCode(phone))).toMatchObject({
      status: 400,
      body: { error: { code: "code_expired" } },
    });
  });
});
