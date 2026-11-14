import { getMeRoute, startPhoneSignInRoute, verifyPhoneCodeRoute } from "@shareride/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SmsSendError } from "../../platform/sms.ts";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

const device = { platform: "ios", name: "Test phone", appVersion: "1.0.0" } as const;

function start(phoneNumber: string, locale: "is" | "en" = "en") {
  return api.client.call(startPhoneSignInRoute, { body: { phoneNumber, locale } });
}

function verify(phoneNumber: string, code: string) {
  return api.client.call(verifyPhoneCodeRoute, {
    body: { phoneNumber, code, locale: "is", device },
  });
}

/** A code that is not the one sent. */
function wrong(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

describe("sign up and sign in with a phone number", () => {
  it("creates an account on the first sign-in and asks for terms and profile", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.10";

    const started = await start(phone.replace("+354", ""), "is");
    expect(started).toEqual({ ok: true, status: 202, data: { resendAfterSeconds: 30 } });
    expect(api.sms.outbox.at(-1)?.text).toMatch(/^\d{6} er ShareRide kóðinn þinn/);

    const verified = await verify(phone, api.lastCode(phone));
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.status).toBe(200);
    expect(verified.data.isNewUser).toBe(true);
    expect(verified.data.accessToken).toMatch(/^sr_at_/);
    expect(verified.data.refreshToken).toMatch(/^sr_rt_/);
    expect(verified.data.user).toMatchObject({
      phoneNumber: phone,
      locale: "is",
      firstName: null,
      ageConfirmed: false,
      missingSteps: ["legal", "profile"],
    });

    const me = await api.client.call(getMeRoute, { accessToken: verified.data.accessToken });
    expect(me).toMatchObject({ ok: true, data: { id: verified.data.user.id } });
  });

  it("signs in to the same account the next time", async () => {
    const phone = api.newPhoneNumber();
    const first = await api.signIn(phone);
    const second = await api.signIn(phone);
    expect(second.isNewUser).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it("answers the same for a known and an unknown number (rule R1.4)", async () => {
    const known = api.newPhoneNumber();
    await api.signIn(known);
    api.advance(31);
    api.ip = "192.0.2.11";
    const forKnown = await api.request("/v1/auth/phone/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: known, locale: "en" }),
    });
    const forUnknown = await api.request("/v1/auth/phone/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: api.newPhoneNumber(), locale: "en" }),
    });
    expect(forKnown.status).toBe(forUnknown.status);
    expect(await forKnown.text()).toBe(await forUnknown.text());
  });

  it("refuses numbers that are not mobile numbers, and unsupported countries", async () => {
    api.ip = "192.0.2.12";
    expect(await start("123")).toMatchObject({ status: 400, error: { code: "phone_invalid" } });
    expect(await start("+354 551 0000")).toMatchObject({ error: { code: "phone_invalid" } });
    expect(await start("+86 138 0013 8000")).toMatchObject({
      status: 400,
      error: { code: "phone_country_unsupported" },
    });
    expect(api.sms.outbox.filter((message) => message.to.startsWith("+86"))).toEqual([]);
  });
});

describe("codes (rule R1.2)", () => {
  it("work once only", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.20";
    await start(phone);
    const code = api.lastCode(phone);
    expect((await verify(phone, code)).ok).toBe(true);
    expect(await verify(phone, code)).toMatchObject({
      status: 400,
      error: { code: "code_expired" },
    });
  });

  it("expire after 10 minutes", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.21";
    await start(phone);
    api.advance(600);
    expect(await verify(phone, api.lastCode(phone))).toMatchObject({
      status: 400,
      error: { code: "code_expired" },
    });
  });

  it("allow 5 attempts, saying how many are left, then ask for a new code", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.22";
    await start(phone);
    const code = api.lastCode(phone);
    for (const attemptsLeft of [4, 3, 2, 1]) {
      expect(await verify(phone, wrong(code))).toMatchObject({
        status: 400,
        error: { code: "code_invalid", attemptsLeft },
      });
    }
    const fifth = await verify(phone, wrong(code));
    expect(fifth).toMatchObject({ status: 429, error: { code: "code_attempts_exceeded" } });
    if (fifth.ok) return;
    expect(fifth.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(fifth.error.retryAfterSeconds).toBeLessThanOrEqual(30);

    // Even the right code no longer works.
    expect(await verify(phone, code)).toMatchObject({
      error: { code: "code_attempts_exceeded" },
    });

    // A new code does.
    api.advance(31);
    await start(phone);
    expect((await verify(phone, api.lastCode(phone))).ok).toBe(true);
  });

  it("are replaced by a newer code", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.23";
    await start(phone);
    const first = api.lastCode(phone);
    api.advance(31);
    await start(phone);
    const second = api.lastCode(phone);
    if (first !== second) {
      expect(await verify(phone, first)).toMatchObject({ error: { code: "code_invalid" } });
    }
    expect((await verify(phone, second)).ok).toBe(true);
  });

  it("are stored only as hashes, and the number is not stored with them", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.24";
    await start(phone);
    const code = api.lastCode(phone);
    const { rows } = await api.connection.pool.query<Record<string, unknown>>(
      "SELECT * FROM verification_codes",
    );
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(code);
    expect(stored).not.toContain(phone.slice(1));
  });
});

describe("sending limits (rule R1.3)", () => {
  it("allow one code per 30 seconds per number", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.30";
    expect((await start(phone)).ok).toBe(true);
    api.advance(10);
    const response = await api.request("/v1/auth/phone/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone, locale: "en" }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("20");
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limited", retryAfterSeconds: 20 },
    });
    api.advance(20);
    expect((await start(phone)).ok).toBe(true);
  });

  it("allow 5 codes per hour per number", async () => {
    const phone = api.newPhoneNumber();
    for (let i = 0; i < 5; i++) {
      api.ip = `192.0.2.${String(40 + i)}`;
      expect((await start(phone)).ok).toBe(true);
      api.advance(31);
    }
    api.ip = "192.0.2.45";
    const sixth = await start(phone);
    expect(sixth).toMatchObject({ status: 429, error: { code: "rate_limited" } });
    if (sixth.ok) return;
    // The first code leaves the hour 3600 - 5 * 31 seconds from now.
    expect(sixth.error.retryAfterSeconds).toBe(3600 - 5 * 31);
  });

  it("allow 10 codes per hour per IP address", async () => {
    api.ip = "192.0.2.50";
    for (let i = 0; i < 10; i++) expect((await start(api.newPhoneNumber())).ok).toBe(true);
    expect(await start(api.newPhoneNumber())).toMatchObject({
      status: 429,
      error: { code: "rate_limited" },
    });
    api.ip = "192.0.2.51";
    expect((await start(api.newPhoneNumber())).ok).toBe(true);
  });

  it("allow 50 codes per hour to a country calling code other than +354, and log it", async () => {
    // Norwegian mobile numbers +47 41 00 00 00 to +47 41 00 00 50.
    const norwegian = (i: number) => `+474100${String(i).padStart(4, "0")}`;
    for (let i = 0; i < 50; i++) {
      api.ip = `203.0.113.${String(i)}`;
      expect((await start(norwegian(i))).ok).toBe(true);
    }
    api.ip = "203.0.113.200";
    expect(await start(norwegian(50))).toMatchObject({
      status: 429,
      error: { code: "rate_limited" },
    });
    const warning = api.logLines.find((line) => line.includes("calling code limit"));
    expect(warning).toContain('"callingCode":"47"');
  });

  it("cap codes per day to a country calling code, and log it", async () => {
    // Danish mobile numbers +45 30 10 00 00 upwards: 50 in each of two hours.
    const danish = (i: number) => `+45${String(30_100_000 + i)}`;
    for (let hour = 0; hour < 2; hour++) {
      for (let i = 0; i < 50; i++) {
        api.ip = `198.18.${String(hour)}.${String(i)}`;
        expect((await start(danish(hour * 50 + i))).ok).toBe(true);
      }
      api.advance(3601);
    }
    // A new hour, so only the daily cap of 100 can refuse this one.
    api.ip = "198.18.2.1";
    expect(await start(danish(100))).toMatchObject({
      status: 429,
      error: { code: "rate_limited" },
    });
    const warning = api.logLines.find(
      (line) => line.includes("calling code limit") && line.includes('"callingCode":"45"'),
    );
    expect(warning).toBeDefined();
  });

  it("do not count refused requests, so a blocked number recovers on time", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.60";
    await start(phone);
    for (let i = 0; i < 5; i++) {
      api.advance(5);
      expect((await start(phone)).ok).toBe(false);
    }
    api.advance(6);
    expect((await start(phone)).ok).toBe(true);
  });
});

describe("when the SMS cannot be sent", () => {
  it("says so, and logs neither the number nor the code", async () => {
    const phone = api.newPhoneNumber();
    api.ip = "192.0.2.90";
    const before = api.logLines.length;
    api.smsFailure = new SmsSendError("Vonage refused the message (HTTP 400)");
    try {
      expect(await start(phone)).toMatchObject({ status: 502, error: { code: "sms_failed" } });
    } finally {
      api.smsFailure = null;
    }
    const logged = api.logLines.slice(before).join("\n");
    expect(logged).toContain("sign-in code SMS not sent");
    expect(logged).toContain("HTTP 400");
    expect(logged).not.toContain(phone.slice(4));
    expect(logged).not.toContain(api.lastCode(phone));
  });
});

describe("privacy", () => {
  it("keeps phone numbers and codes out of the logs", async () => {
    const phone = api.newPhoneNumber();
    await api.signIn(phone);
    const logs = api.logLines.join("\n");
    expect(logs).not.toContain(phone.slice(1));
    expect(logs).not.toContain(api.lastCode(phone));
    expect(logs).toContain('"msg":"signed in"');
  });
});
