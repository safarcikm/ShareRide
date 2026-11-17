import {
  adminAddPasskeyOptionsRoute,
  adminAddPasskeyRoute,
  adminConfirmOptionsRoute,
  adminConfirmRoute,
  adminMeRoute,
  adminPasskeysRoute,
  adminSetupOptionsRoute,
  adminSetupRoute,
  adminSignInOptionsRoute,
  adminSignInRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { operatorRole } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, testAdminOrigin, type TestApi } from "../../testing.ts";
import { cleanUpOperatorSignIn } from "./clean-up.ts";
import { createPasskeyService, type PasskeyService } from "./passkeys.ts";
import { createOperatorSessionService } from "./sessions.ts";
import { createTestAuthenticator, type TestAuthenticator } from "./testing-authenticator.ts";

let api: TestApi;
let passkeys: PasskeyService;
let addresses = 0;

beforeAll(async () => {
  api = await startTestApi();
  passkeys = createPasskeyService({
    ...api.features,
    sessions: createOperatorSessionService(api.features),
    adminOrigin: testAdminOrigin,
  });
});

afterAll(async () => {
  await api.close();
});

/** A fresh network address, so the sign-in limits of one test do not reach the next. */
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
      options?: { challenge: string; user?: { id: string } };
      error?: { code: string };
    },
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null,
  };
}

async function newOperator() {
  const { userId } = await api.signIn(api.newPhoneNumber());
  await api.connection.db
    .update(schema.users)
    .set({ roles: [operatorRole] })
    .where(eq(schema.users.id, userId));
  newAddress();
  return userId;
}

/** Runs a setup link from the `operator` command to the end. */
async function setUp(userId: string, authenticator: TestAuthenticator, name = "Laptop") {
  const { token } = await passkeys.createSetupLink(userId);
  const options = await post(adminSetupOptionsRoute.path, { token });
  expect(options.status).toBe(200);
  const credential = authenticator.register(options.body.options ?? { challenge: "" });
  return post(adminSetupRoute.path, { token, credential, name });
}

async function signIn(authenticator: TestAuthenticator) {
  const options = await post(adminSignInOptionsRoute.path, {});
  expect(options.status).toBe(200);
  const credential = authenticator.authenticate(options.body.options ?? { challenge: "" });
  return post(adminSignInRoute.path, { credential });
}

async function auditActions(userId: string) {
  const { rows } = await api.connection.pool.query<{ action: string }>(
    "SELECT action FROM audit_log WHERE operator_user_id = $1 ORDER BY created_at, id",
    [userId],
  );
  return rows.map((row) => row.action);
}

const authenticator = (options: { origin?: string; withoutUserVerification?: boolean } = {}) =>
  createTestAuthenticator({ origin: testAdminOrigin, ...options });

describe("saving the first passkey with a setup link (ADR 0028)", () => {
  it("saves the passkey, signs the operator in and records both", async () => {
    const userId = await newOperator();
    const result = await setUp(userId, authenticator());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ userId, locale: "en" });
    expect(result.cookie).toMatch(/^sr_operator=sr_os_/);
    const me = await api.request(adminMeRoute.path, { headers: { cookie: result.cookie ?? "" } });
    expect(me.status).toBe(200);
    expect(await auditActions(userId)).toEqual(["operator.passkey.added", "operator.signed_in"]);
  });

  it("works only once", async () => {
    const userId = await newOperator();
    const { token } = await passkeys.createSetupLink(userId);
    const options = await post(adminSetupOptionsRoute.path, { token });
    const credential = authenticator().register(options.body.options ?? { challenge: "" });
    expect((await post(adminSetupRoute.path, { token, credential, name: "Laptop" })).status).toBe(
      200,
    );
    const again = await post(adminSetupOptionsRoute.path, { token });
    expect(again).toMatchObject({ status: 400, body: { error: { code: "setup_link_invalid" } } });
  });

  it("saves only one passkey when two answers arrive at once", async () => {
    const userId = await newOperator();
    const { token } = await passkeys.createSetupLink(userId);
    const answers = [];
    for (const name of ["Laptop", "Phone"]) {
      const options = await post(adminSetupOptionsRoute.path, { token });
      const credential = authenticator().register(options.body.options ?? { challenge: "" });
      answers.push({ token, credential, name });
    }
    const results = await Promise.all(answers.map((answer) => post(adminSetupRoute.path, answer)));
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    const saved = await api.connection.db
      .select()
      .from(schema.operatorPasskeys)
      .where(eq(schema.operatorPasskeys.userId, userId));
    expect(saved).toHaveLength(1);
  });

  it("stops working after 30 minutes", async () => {
    const userId = await newOperator();
    const { token } = await passkeys.createSetupLink(userId);
    api.advance(30 * 60);
    const options = await post(adminSetupOptionsRoute.path, { token });
    expect(options).toMatchObject({ status: 400, body: { error: { code: "setup_link_invalid" } } });
  });

  it("stops working when a newer link is made", async () => {
    const userId = await newOperator();
    const first = await passkeys.createSetupLink(userId);
    await passkeys.createSetupLink(userId);
    const options = await post(adminSetupOptionsRoute.path, { token: first.token });
    expect(options.status).toBe(400);
  });

  it("refuses a link whose account lost the role, was suspended or waits to be deleted", async () => {
    const lostRole = await newOperator();
    const suspended = await newOperator();
    const deleting = await newOperator();
    const links = [
      await passkeys.createSetupLink(lostRole),
      await passkeys.createSetupLink(suspended),
      await passkeys.createSetupLink(deleting),
    ];
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date("2026-12-01T10:00:00Z") })
      .where(eq(schema.users.id, deleting));
    await api.connection.db
      .update(schema.users)
      .set({ roles: [] })
      .where(eq(schema.users.id, lostRole));
    await api.connection.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, suspended));
    for (const { token } of links) {
      expect((await post(adminSetupOptionsRoute.path, { token })).status).toBe(400);
    }
  });

  it("refuses a token that was never made", async () => {
    newAddress();
    const options = await post(adminSetupOptionsRoute.path, { token: "sr_ol_not-a-real-token" });
    expect(options.status).toBe(400);
  });

  it("refuses a passkey made for another site", async () => {
    const userId = await newOperator();
    const result = await setUp(userId, authenticator({ origin: "https://elsewhere.test" }));
    expect(result).toMatchObject({ status: 400, body: { error: { code: "passkey_invalid" } } });
    expect(result.cookie).toBeNull();
  });

  it("refuses a passkey that did not check who was there (no PIN or fingerprint)", async () => {
    const userId = await newOperator();
    const result = await setUp(userId, authenticator({ withoutUserVerification: true }));
    expect(result).toMatchObject({ status: 400, body: { error: { code: "passkey_invalid" } } });
  });

  it("refuses an answer to another link's challenge", async () => {
    const first = await newOperator();
    const second = await newOperator();
    const firstLink = await passkeys.createSetupLink(first);
    const secondLink = await passkeys.createSetupLink(second);
    const options = await post(adminSetupOptionsRoute.path, { token: firstLink.token });
    const credential = authenticator().register(options.body.options ?? { challenge: "" });
    const result = await post(adminSetupRoute.path, {
      token: secondLink.token,
      credential,
      name: "Laptop",
    });
    expect(result).toMatchObject({ status: 400, body: { error: { code: "passkey_invalid" } } });
  });
});

describe("signing in with a passkey", () => {
  it("signs the operator in and records it", async () => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    const result = await signIn(key);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ userId });
    expect(result.cookie).toMatch(/^sr_operator=sr_os_/);
    expect(await auditActions(userId)).toEqual([
      "operator.passkey.added",
      "operator.signed_in",
      "operator.signed_in",
    ]);
    const [passkey] = await api.connection.db
      .select()
      .from(schema.operatorPasskeys)
      .where(eq(schema.operatorPasskeys.userId, userId));
    expect(passkey?.counter).toBe(1);
    expect(passkey?.lastUsedAt).toEqual(api.now());
  });

  it("refuses the same answer twice", async () => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    const options = await post(adminSignInOptionsRoute.path, {});
    const credential = key.authenticate(options.body.options ?? { challenge: "" });
    expect((await post(adminSignInRoute.path, { credential })).status).toBe(200);
    const replayed = await post(adminSignInRoute.path, { credential });
    expect(replayed).toMatchObject({ status: 401, body: { error: { code: "passkey_invalid" } } });
  });

  it("refuses an answer after 5 minutes", async () => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    const options = await post(adminSignInOptionsRoute.path, {});
    api.advance(5 * 60 + 1);
    const credential = key.authenticate(options.body.options ?? { challenge: "" });
    expect((await post(adminSignInRoute.path, { credential })).status).toBe(401);
  });

  it("refuses a passkey it does not know", async () => {
    newAddress();
    const result = await signIn(authenticator());
    expect(result).toMatchObject({ status: 401, body: { error: { code: "passkey_invalid" } } });
  });

  it("refuses a copied passkey whose counter went back", async () => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    expect((await signIn(key)).status).toBe(200);
    key.setCounter(0);
    expect((await signIn(key)).status).toBe(401);
  });

  it.each([
    ["was suspended", { status: "suspended" }],
    ["lost the role", { roles: [] }],
    ["waits to be deleted", { deleteAfter: new Date("2026-12-01T10:00:00Z") }],
  ])("refuses an account that %s", async (_case, change) => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    await api.connection.db.update(schema.users).set(change).where(eq(schema.users.id, userId));
    const result = await signIn(key);
    expect(result).toMatchObject({
      status: 403,
      body: { error: { code: "operator_unavailable" } },
    });
    expect(result.cookie).toBeNull();
  });

  it("refuses an answer given on another site", async () => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    key.setOrigin("https://elsewhere.test");
    expect(await signIn(key)).toMatchObject({ status: 401, cookie: null });
  });

  it("refuses an answer that did not check who was there", async () => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    key.skipUserVerification();
    expect(await signIn(key)).toMatchObject({ status: 401, cookie: null });
  });

  it("refuses a setup challenge as a sign-in", async () => {
    const userId = await newOperator();
    const key = authenticator();
    await setUp(userId, key);
    const { token } = await passkeys.createSetupLink(userId);
    const options = await post(adminSetupOptionsRoute.path, { token });
    const credential = key.authenticate(options.body.options ?? { challenge: "" });
    expect((await post(adminSignInRoute.path, { credential })).status).toBe(401);
  });

  it("limits tries per network address", async () => {
    newAddress();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await post(adminSignInOptionsRoute.path, {})).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("counts an IPv6 address by its /64 network", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      api.ip = `2001:db8:0:${String(addresses)}::${String(attempt + 1)}`;
      statuses.push((await post(adminSignInOptionsRoute.path, {})).status);
    }
    expect(statuses[10]).toBe(429);
    newAddress();
  });

  it("limits tries of setup links too", async () => {
    newAddress();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const token = `sr_ol_guess-${String(attempt)}`;
      statuses.push((await post(adminSetupOptionsRoute.path, { token })).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("the operator's passkeys", () => {
  async function signedIn() {
    const userId = await newOperator();
    const key = authenticator();
    const setUpResult = await setUp(userId, key);
    return { userId, key, cookie: setUpResult.cookie ?? "" };
  }

  async function confirm(cookie: string, key: TestAuthenticator) {
    const options = await post(adminConfirmOptionsRoute.path, {}, cookie);
    expect(options.status).toBe(200);
    const credential = key.authenticate(options.body.options ?? { challenge: "" });
    return post(adminConfirmRoute.path, { credential }, cookie);
  }

  async function addPasskey(cookie: string, key: TestAuthenticator, name = "Phone") {
    const options = await post(adminAddPasskeyOptionsRoute.path, {}, cookie);
    expect(options.status).toBe(200);
    const credential = key.register(options.body.options ?? { challenge: "" });
    return post(adminAddPasskeyRoute.path, { credential, name }, cookie);
  }

  const list = async (cookie: string) => {
    const response = await api.request(adminPasskeysRoute.path, { headers: { cookie } });
    return (await response.json()) as { passkeys: { id: string; name: string }[] };
  };

  const remove = (cookie: string, id: string) =>
    api.request(`/admin/v1/passkeys/${id}`, { method: "DELETE", headers: { cookie } });

  it("needs a console session", async () => {
    newAddress();
    expect((await api.request(adminPasskeysRoute.path)).status).toBe(401);
    expect((await post(adminAddPasskeyOptionsRoute.path, {})).status).toBe(401);
  });

  it("adds another passkey, which can then sign in", async () => {
    const { userId, cookie } = await signedIn();
    const phone = authenticator();
    const added = await addPasskey(cookie, phone);
    expect(added).toMatchObject({ status: 201, body: { name: "Phone", backedUp: false } });
    expect((await list(cookie)).passkeys.map((passkey) => passkey.name)).toEqual([
      "Laptop",
      "Phone",
    ]);
    expect((await signIn(phone)).status).toBe(200);
    expect(await auditActions(userId)).toContain("operator.passkey.added");
  });

  it("refuses a sign-in challenge as the answer for a new passkey", async () => {
    const { cookie } = await signedIn();
    const options = await post(adminSignInOptionsRoute.path, {});
    const credential = authenticator().register(options.body.options ?? { challenge: "" });
    const result = await post(adminAddPasskeyRoute.path, { credential, name: "Phone" }, cookie);
    expect(result).toMatchObject({ status: 400, body: { error: { code: "passkey_invalid" } } });
  });

  it("refuses another operator's challenge", async () => {
    const first = await signedIn();
    const second = await signedIn();
    const options = await post(adminAddPasskeyOptionsRoute.path, {}, first.cookie);
    const credential = authenticator().register(options.body.options ?? { challenge: "" });
    const result = await post(
      adminAddPasskeyRoute.path,
      { credential, name: "Phone" },
      second.cookie,
    );
    expect(result.status).toBe(400);
  });

  it("refuses the same passkey twice", async () => {
    const { cookie } = await signedIn();
    const phone = authenticator();
    expect((await addPasskey(cookie, phone)).status).toBe(201);
    expect((await addPasskey(cookie, phone)).status).toBe(400);
  });

  it("removes a passkey but keeps the last one", async () => {
    const { userId, cookie } = await signedIn();
    await addPasskey(cookie, authenticator());
    const [laptop, phone] = (await list(cookie)).passkeys;
    expect((await remove(cookie, laptop?.id ?? "")).status).toBe(204);
    const last = await remove(cookie, phone?.id ?? "");
    expect(last.status).toBe(409);
    expect(await last.json()).toMatchObject({ error: { code: "last_passkey" } });
    expect(await auditActions(userId)).toContain("operator.passkey.removed");
  });

  it("asks for a passkey again once 5 minutes have passed since one was used", async () => {
    const { userId, key, cookie } = await signedIn();
    api.advance(5 * 60);
    const refused = await post(adminAddPasskeyOptionsRoute.path, {}, cookie);
    expect(refused).toMatchObject({
      status: 403,
      body: { error: { code: "confirmation_required" } },
    });
    const [laptop] = (await list(cookie)).passkeys;
    expect((await remove(cookie, laptop?.id ?? "")).status).toBe(403);
    const confirmed = await confirm(cookie, key);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body["confirmedUntil"]).toBe(
      new Date(api.now().getTime() + 5 * 60_000).toISOString(),
    );
    expect((await addPasskey(cookie, authenticator())).status).toBe(201);
    expect(await auditActions(userId)).toContain("operator.confirmed");
  });

  it("confirms only with the operator's own passkey", async () => {
    const first = await signedIn();
    const second = await signedIn();
    const options = await post(adminConfirmOptionsRoute.path, {}, second.cookie);
    const credential = first.key.authenticate(options.body.options ?? { challenge: "" });
    const result = await post(adminConfirmRoute.path, { credential }, second.cookie);
    expect(result).toMatchObject({ status: 400, body: { error: { code: "passkey_invalid" } } });
  });

  it("cannot remove another operator's passkey", async () => {
    const first = await signedIn();
    const second = await signedIn();
    await addPasskey(second.cookie, authenticator());
    const [theirs] = (await list(second.cookie)).passkeys;
    expect((await remove(first.cookie, theirs?.id ?? "")).status).toBe(404);
  });
});

describe("cleaning up sign-in records", () => {
  it("deletes challenges and setup links that can no longer be used", async () => {
    const userId = await newOperator();
    await passkeys.createSetupLink(userId);
    await post(adminSignInOptionsRoute.path, {});
    const later = new Date(api.now().getTime() + 31 * 60_000);
    expect(await cleanUpOperatorSignIn(api.connection.db, later)).toBeGreaterThanOrEqual(2);
    const links = await api.connection.db
      .select()
      .from(schema.operatorSetupLinks)
      .where(eq(schema.operatorSetupLinks.userId, userId));
    expect(links).toEqual([]);
  });
});
