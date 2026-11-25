import {
  addPasskeyRoute,
  configRoute,
  listSignInMethodsRoute,
  passkeySetupOptionsRoute,
  passkeySignInOptionsRoute,
  passkeySignInRoute,
  removePasskeyRoute,
  sendConfirmCodeRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, testWebAppUrl, type TestApi } from "../../testing.ts";
import { createTestAuthenticator, type TestAuthenticator } from "../admin/testing-authenticator.ts";

// Members' Face ID or fingerprint on the website (spec 27, 3.3 and 3.6; ADR
// 0048): a passkey kept on the device, set up with a fresh sign-in or a
// confirm code, signing in on its own.

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

beforeEach(() => {
  api.email.sent.length = 0;
});

afterAll(async () => {
  await api.close();
});

const { memberPasskeys, operatorPasskeys, users } = schema;
const iPhoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const webDevice = { platform: "web" } as const;
let addresses = 0;
let networks = 0;

/** A new network address for the next requests, so tests do not share its limit. */
function newIp(): void {
  networks += 1;
  api.ip = `198.51.100.${String(networks % 250)}`;
}

type Member = Awaited<ReturnType<TestApi["signIn"]>> & { readonly email: string };

/** A member just signed in, with a verified email. */
async function member(): Promise<Member> {
  addresses += 1;
  const email = `passkey-${String(addresses)}@example.com`;
  const phone = api.newPhoneNumber();
  const { userId } = await api.signIn(phone);
  await api.connection.db
    .update(users)
    .set({ email, emailVerifiedAt: api.now() })
    .where(eq(users.id, userId));
  return { ...(await api.signIn(phone, "web")), email };
}

const authenticator = () => createTestAuthenticator({ origin: testWebAppUrl });

interface Options {
  readonly challenge: string;
  readonly user?: { readonly id: string };
}

/** Starts setting up on this device; `code` when the sign-in is old. */
async function setupOptions(who: Member, code?: string) {
  return api.client.call(passkeySetupOptionsRoute, {
    accessToken: who.accessToken,
    body: code === undefined ? {} : { code },
  });
}

/** Sends the device's new passkey, from a browser on an iPhone. */
async function addPasskey(who: Member, credential: Record<string, unknown>) {
  const response = await api.request(addPasskeyRoute.path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${who.accessToken}`,
      "user-agent": iPhoneSafari,
    },
    body: JSON.stringify({ credential }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown> & { error?: { code: string } },
  };
}

/** Sets up a passkey with a fresh sign-in, and gives what was saved. */
async function setUp(who: Member, device: TestAuthenticator) {
  const options = await setupOptions(who);
  if (!options.ok) throw new Error(options.error.code);
  const added = await addPasskey(who, device.register(options.data.options));
  expect(added.status).toBe(201);
  return added.body;
}

async function signIn(device: TestAuthenticator) {
  const options = await api.client.call(passkeySignInOptionsRoute, { body: {} });
  if (!options.ok) throw new Error(options.error.code);
  return api.client.call(passkeySignInRoute, {
    body: {
      credential: device.authenticate(options.data.options as Options) as never,
      device: { platform: "ios", name: "Test phone", appVersion: "1.0.0" },
    },
  });
}

async function confirmCode(who: Member): Promise<string> {
  api.advance(31);
  const sent = await api.client.call(sendConfirmCodeRoute, {
    accessToken: who.accessToken,
    body: {},
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return api.lastEmailCode(who.email);
}

describe("setting up Face ID or fingerprint (spec 27, 3.6)", () => {
  it("asks for a passkey kept on the device, by the account's own handle, then saves and lists it", async () => {
    const anna = await member();
    const options = await setupOptions(anna);
    expect(options).toMatchObject({
      ok: true,
      status: 200,
      data: {
        options: {
          rp: { id: "shareride.test" },
          attestation: "none",
          excludeCredentials: [],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
          },
        },
      },
    });
    if (!options.ok) return;
    const sent = options.data.options as unknown as Options & {
      pubKeyCredParams: { alg: number }[];
      user: { id: string };
    };
    expect(sent.pubKeyCredParams.map((param) => param.alg)).toEqual([-7, -257]);
    // Never the account's ID, which the console's passkeys use (ADR 0048).
    expect(Buffer.from(sent.user.id, "base64url").toString("hex")).not.toBe(
      anna.userId.replaceAll("-", ""),
    );
    expect(Buffer.from(sent.user.id, "base64url")).toHaveLength(32);

    const device = authenticator();
    const added = await addPasskey(anna, device.register(sent));
    expect(added).toMatchObject({
      status: 201,
      body: {
        browser: "Safari",
        system: "iPhone",
        createdAt: api.now().toISOString(),
        lastUsedAt: null,
      },
    });
    expect(
      await api.client.call(listSignInMethodsRoute, { accessToken: anna.accessToken }),
    ).toMatchObject({
      ok: true,
      data: {
        passkeys: [
          {
            id: added.body["id"],
            credentialId: device.credentialId,
            browser: "Safari",
            system: "iPhone",
          },
        ],
      },
    });

    // The next device's options leave this one out, under the same handle.
    const next = await setupOptions(anna);
    expect(next).toMatchObject({
      ok: true,
      data: {
        options: { excludeCredentials: [{ id: device.credentialId }], user: { id: sent.user.id } },
      },
    });
  });

  it("tells the verified email which device was set up (R27.7)", async () => {
    const bjorn = await member();
    await setUp(bjorn, authenticator());
    expect(api.email.sent.map((email) => [email.to, email.subject])).toEqual([
      [bjorn.email, "Face ID or fingerprint was set up for your PuffinRide account"],
    ]);
    expect(api.email.sent[0]?.text).toContain("It was set up on Safari on iPhone.");
  });

  it("asks for a confirm code once the sign-in is 10 minutes old, and takes it (R27.5)", async () => {
    const cecilia = await member();
    api.advance(10 * 60);
    expect(await setupOptions(cecilia)).toMatchObject({
      ok: false,
      status: 403,
      error: { code: "confirm_required" },
    });
    const code = await confirmCode(cecilia);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await setupOptions(cecilia, wrong)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "code_invalid" },
    });
    const options = await setupOptions(cecilia, code);
    expect(options).toMatchObject({ ok: true, status: 200 });
    if (!options.ok) return;
    const added = await addPasskey(cecilia, authenticator().register(options.data.options));
    expect(added.status).toBe(201);
    expect(await setupOptions(cecilia, code)).toMatchObject({
      ok: false,
      error: { code: "code_expired" },
    });
  });

  it("sets up at most 10 devices (R27.8)", async () => {
    const dora = await member();
    const nine = Array.from({ length: 9 }, (_, i) => ({
      userId: dora.userId,
      credentialId: `credential-of-dora-${String(i)}`,
      publicKey: "AA",
      backedUp: false,
      userHandle: "handle-of-dora",
    }));
    await api.connection.db.insert(memberPasskeys).values(nine);
    // The tenth, from options asked before it was full.
    const options = await setupOptions(dora);
    const late = await setupOptions(dora);
    if (!options.ok || !late.ok) throw new Error("No options.");
    await addPasskey(dora, authenticator().register(options.data.options));
    expect(await setupOptions(dora)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "too_many" },
    });
    expect(
      await addPasskey(dora, authenticator().register(late.data.options as Options)),
    ).toMatchObject({ status: 409, body: { error: { code: "too_many" } } });
  });

  it("saves one of two devices added at once with 9 set up (R27.8)", async () => {
    const ester = await member();
    await api.connection.db.insert(memberPasskeys).values(
      Array.from({ length: 9 }, (_, i) => ({
        userId: ester.userId,
        credentialId: `credential-of-ester-${String(i)}`,
        publicKey: "AA",
        backedUp: false,
        userHandle: "handle-of-ester",
      })),
    );
    const one = await setupOptions(ester);
    const two = await setupOptions(ester);
    if (!one.ok || !two.ok) throw new Error("No options.");
    const saved = await Promise.all([
      addPasskey(ester, authenticator().register(one.data.options as Options)),
      addPasskey(ester, authenticator().register(two.data.options as Options)),
    ]);
    expect(saved.map((answer) => answer.status).sort()).toEqual([201, 409]);
    const [devices] = await api.connection.db
      .select({ value: count() })
      .from(memberPasskeys)
      .where(eq(memberPasskeys.userId, ester.userId));
    expect(devices?.value).toBe(10);
  });

  it("keeps the account's handle when its last device is removed and set up again", async () => {
    const gudrun = await member();
    const first = await setupOptions(gudrun);
    if (!first.ok) throw new Error(first.error.code);
    const handle = (first.data.options as Options).user?.id;
    const added = await addPasskey(gudrun, authenticator().register(first.data.options));
    await api.client.call(removePasskeyRoute, {
      accessToken: gudrun.accessToken,
      params: { id: String(added.body["id"]) },
    });
    const again = await setupOptions(gudrun);
    if (!again.ok) throw new Error(again.error.code);
    // The device replaces its passkey for this handle, rather than keeping two.
    expect((again.data.options as Options).user?.id).toBe(handle);
    const other = await member();
    const theirs = await setupOptions(other);
    if (!theirs.ok) throw new Error(theirs.error.code);
    expect((theirs.data.options as Options).user?.id).not.toBe(handle);
  });

  it("keeps at most 5 setups of one account waiting for the browser", async () => {
    const hrafn = await member();
    const asked = [];
    for (let i = 0; i < 6; i += 1) {
      const options = await setupOptions(hrafn);
      if (!options.ok) throw new Error(options.error.code);
      asked.push(options.data.options);
      // Each a second later, so the oldest is the first.
      api.advance(1);
    }
    const waiting = await api.connection.db
      .select()
      .from(schema.memberPasskeyChallenges)
      .where(eq(schema.memberPasskeyChallenges.userId, hrafn.userId));
    expect(waiting).toHaveLength(5);
    const [oldest] = asked;
    if (oldest === undefined) throw new Error("No options.");
    expect(waiting.map((row) => row.challenge)).not.toContain(oldest.challenge);
    expect(await addPasskey(hrafn, authenticator().register(oldest))).toMatchObject({
      status: 400,
    });
    expect(await addPasskey(hrafn, authenticator().register(asked[5] as Options))).toMatchObject({
      status: 201,
    });
  });

  it("refuses a challenge used twice, someone else's, or answered after 5 minutes", async () => {
    const egill = await member();
    const freyja = await member();
    const options = await setupOptions(egill);
    if (!options.ok) throw new Error(options.error.code);
    const answer = authenticator().register(options.data.options);
    // Freyja cannot save the passkey Egill's options asked for.
    expect(await addPasskey(freyja, answer)).toMatchObject({
      status: 400,
      body: { error: { code: "passkey_invalid" } },
    });
    // Taken by that try, the challenge is gone.
    expect(await addPasskey(egill, answer)).toMatchObject({ status: 400 });

    const late = await setupOptions(egill);
    if (!late.ok) throw new Error(late.error.code);
    api.advance(5 * 60 + 1);
    expect(
      await addPasskey(egill, authenticator().register(late.data.options as Options)),
    ).toMatchObject({ status: 400, body: { error: { code: "passkey_invalid" } } });
  });

  it("refuses an answer from another site", async () => {
    const gunnar = await member();
    const options = await setupOptions(gunnar);
    if (!options.ok) throw new Error(options.error.code);
    const elsewhere = createTestAuthenticator({ origin: "https://not-puffinride.example" });
    expect(
      await addPasskey(gunnar, elsewhere.register(options.data.options as Options)),
    ).toMatchObject({ status: 400, body: { error: { code: "passkey_invalid" } } });
  });
});

describe("signing in with Face ID or fingerprint (spec 27, 3.3)", () => {
  it("signs in with no email typed, and keeps the counter and the last use", async () => {
    const helga = await member();
    const device = authenticator();
    await setUp(helga, device);
    api.advance(60);
    newIp();
    const signedIn = await signIn(device);
    expect(signedIn).toMatchObject({
      ok: true,
      status: 200,
      data: { status: "signedIn", isNewUser: false, user: { id: helga.userId } },
    });
    const [row] = await api.connection.db
      .select({ counter: memberPasskeys.counter, lastUsedAt: memberPasskeys.lastUsedAt })
      .from(memberPasskeys)
      .where(eq(memberPasskeys.userId, helga.userId));
    expect(row).toEqual({ counter: 1, lastUsedAt: api.now() });
    expect(api.logLines.join("")).toContain('"via":"passkey"');
  });

  it("says a passkey in neither table is unknown, so the browser can forget it (spec 28, 3.4)", async () => {
    newIp();
    const stranger = authenticator();
    stranger.register({ challenge: "AAAA", user: { id: "AZCh1gAAcACAAAAAAAAAAQ" } });
    expect(await signIn(stranger)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "passkey_unknown" },
    });
  });

  it("refuses the console's passkey on the same site, and never calls it unknown (R28.4)", async () => {
    const operator = await member();
    newIp();
    const console = authenticator();
    // Made for the console: the browser keeps it under the account's ID.
    console.register({ challenge: "AAAA", user: { id: "AZCh1gAAcACAAAAAAAAAAQ" } });
    await api.connection.db.insert(operatorPasskeys).values({
      userId: operator.userId,
      credentialId: console.credentialId,
      publicKey: "AAAA",
      backedUp: true,
      name: "Laptop",
    });
    expect(await signIn(console)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "passkey_invalid" },
    });
  });

  it("says a removed passkey is unknown", async () => {
    const ingi = await member();
    const device = authenticator();
    const saved = await setUp(ingi, device);
    expect(
      await api.client.call(removePasskeyRoute, {
        accessToken: ingi.accessToken,
        params: { id: String(saved["id"]) },
      }),
    ).toMatchObject({ ok: true, status: 204 });
    expect(
      await api.client.call(removePasskeyRoute, {
        accessToken: ingi.accessToken,
        params: { id: String(saved["id"]) },
      }),
    ).toMatchObject({ ok: false, status: 404 });
    newIp();
    // Unknown, so this browser stops offering it (spec 28, 3.4).
    expect(await signIn(device)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "passkey_unknown" },
    });
  });

  it("says a challenge used twice or answered too late has expired", async () => {
    const jona = await member();
    const device = authenticator();
    await setUp(jona, device);
    newIp();
    const options = await api.client.call(passkeySignInOptionsRoute, { body: {} });
    if (!options.ok) throw new Error(options.error.code);
    const answer = device.authenticate(options.data.options) as never;
    const body = { credential: answer, device: webDevice };
    expect(await api.client.call(passkeySignInRoute, { body })).toMatchObject({ ok: true });
    expect(await api.client.call(passkeySignInRoute, { body })).toMatchObject({
      ok: false,
      error: { code: "passkey_expired" },
    });

    const late = await api.client.call(passkeySignInOptionsRoute, { body: {} });
    if (!late.ok) throw new Error(late.error.code);
    api.advance(5 * 60 + 1);
    expect(
      await api.client.call(passkeySignInRoute, {
        body: {
          credential: device.authenticate(late.data.options as Options) as never,
          device: webDevice,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "passkey_expired" } });
  });

  it("says an account cannot sign in only after a good answer", async () => {
    const kari = await member();
    const device = authenticator();
    await setUp(kari, device);
    await api.connection.db
      .update(users)
      .set({ status: "deleted" })
      .where(eq(users.id, kari.userId));
    newIp();
    expect(await signIn(device)).toMatchObject({
      ok: false,
      status: 403,
      error: { code: "account_unavailable" },
    });
  });

  it("limits the sign-in options to 60 in 10 minutes per network address (R28.6)", async () => {
    newIp();
    for (let i = 0; i < 60; i++) {
      expect(await api.client.call(passkeySignInOptionsRoute, { body: {} })).toMatchObject({
        ok: true,
      });
    }
    expect(await api.client.call(passkeySignInOptionsRoute, { body: {} })).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited" },
    });
  });

  it("keeps the refresh token in a cookie on the web", async () => {
    const lilja = await member();
    const device = authenticator();
    await setUp(lilja, device);
    newIp();
    const options = await api.client.call(passkeySignInOptionsRoute, { body: {} });
    if (!options.ok) throw new Error(options.error.code);
    const response = await api.request(passkeySignInRoute.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        credential: device.authenticate(options.data.options),
        device: webDevice,
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["refreshToken"]).toBeUndefined();
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });
});

it("says in the config that the website takes Face ID or fingerprint", async () => {
  expect(await api.client.call(configRoute, {})).toMatchObject({
    ok: true,
    data: { passkeySignIn: true },
  });
});
