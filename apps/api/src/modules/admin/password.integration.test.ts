import {
  adminMeRoute,
  adminPasswordSignInRoute,
  adminSignInMethodsRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { operatorRole } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, testAdminPassword, type TestApi } from "../../testing.ts";

// The console's temporary password sign-in (ADR 0041).

let api: TestApi;
let addresses = 0;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

function newAddress() {
  addresses += 1;
  api.ip = `203.0.113.${String(addresses % 250)}`;
}

async function signIn(phoneNumber: string, password: string) {
  const response = await api.request(adminPasswordSignInRoute.path, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Firefox on Linux" },
    body: JSON.stringify({ phoneNumber, password }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown> & { error?: { code: string } },
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null,
  };
}

async function newOperator() {
  const phone = api.newPhoneNumber();
  const { userId } = await api.signIn(phone);
  await api.connection.db
    .update(schema.users)
    .set({ roles: [operatorRole] })
    .where(eq(schema.users.id, userId));
  newAddress();
  return { userId, phone };
}

async function auditOf(userId: string) {
  const { rows } = await api.connection.pool.query<{ action: string; after: unknown }>(
    "SELECT action, after FROM audit_log WHERE operator_user_id = $1 ORDER BY created_at, id",
    [userId],
  );
  return rows;
}

describe("signing in to the console with the password (ADR 0041)", () => {
  it("tells the sign-in page that the password is on", async () => {
    const response = await api.request(adminSignInMethodsRoute.path);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ password: true });
  });

  it("signs an operator in with their number, typed without the country code, and the password", async () => {
    const { userId, phone } = await newOperator();
    const result = await signIn(phone.replace("+354", ""), testAdminPassword);
    expect(result).toMatchObject({ status: 200, body: { userId, locale: "en" } });
    expect(result.cookie).toMatch(/^sr_operator=sr_os_/);
    const me = await api.request(adminMeRoute.path, { headers: { cookie: result.cookie ?? "" } });
    expect(me.status).toBe(200);
    expect(await auditOf(userId)).toEqual([
      { action: "operator.signed_in", after: { method: "password" } },
    ]);
  });

  it("refuses a wrong password and starts no session", async () => {
    const { userId, phone } = await newOperator();
    const result = await signIn(phone, `${testAdminPassword}x`);
    expect(result).toMatchObject({ status: 401, body: { error: { code: "password_invalid" } } });
    expect(result.cookie).toBeNull();
    expect(await auditOf(userId)).toEqual([]);
  });

  it("refuses the password with a number that is not a phone number", async () => {
    newAddress();
    expect(await signIn("12", testAdminPassword)).toMatchObject({
      status: 401,
      body: { error: { code: "password_invalid" } },
    });
  });

  it("refuses an account that may not use the console", async () => {
    const member = api.newPhoneNumber();
    await api.signIn(member);
    newAddress();
    expect(await signIn(member, testAdminPassword)).toMatchObject({
      status: 403,
      body: { error: { code: "operator_unavailable" } },
    });
  });

  it("limits each address to 5 tries a minute", async () => {
    const { phone } = await newOperator();
    for (let tries = 0; tries < 5; tries += 1) {
      expect((await signIn(phone, "not the password")).status).toBe(401);
    }
    expect(await signIn(phone, testAdminPassword)).toMatchObject({
      status: 429,
      body: { error: { code: "rate_limited" } },
    });
  });

  // Last: it uses up the tries of every address for the hour.
  it("limits tries from all addresses together", async () => {
    const { phone } = await newOperator();
    let refused = null;
    let tries = 0;
    for (; tries < 200 && refused === null; tries += 1) {
      if (tries % 5 === 0) newAddress();
      const result = await signIn(phone, "not the password");
      if (result.status === 429) refused = result;
    }
    expect(refused).toMatchObject({ body: { error: { code: "rate_limited" } } });
    // More than one address's hour: an address alone cannot use them all up.
    expect(tries).toBeGreaterThan(60);
  });
});
