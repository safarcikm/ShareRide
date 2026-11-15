import {
  endSessionRoute,
  listSessionsRoute,
  setPushTokenRoute,
  signOutRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { cleanUpSignInRecords } from "../auth/clean-up.ts";
import { setPushToken } from "./push-tokens.ts";

// A device's push token (plan 4.5): stored per signed-in session, moved to
// the newest session that registers it, and gone when the session ends.

let api: TestApi;
const { pushTokens, sessions } = schema;

beforeAll(async () => {
  api = await startTestApi();
});

beforeEach(async () => {
  await api.connection.db.execute(sql`delete from push_tokens`);
});

afterAll(async () => {
  await api.close();
});

const token = (name: string) => `ExponentPushToken[${name}]`;

function register(accessToken: string, value: string | null) {
  return api.client.call(setPushTokenRoute, { accessToken, body: { token: value } });
}

async function stored() {
  return api.connection.db
    .select({
      userId: pushTokens.userId,
      sessionId: pushTokens.sessionId,
      platform: pushTokens.platform,
      token: pushTokens.token,
    })
    .from(pushTokens)
    .orderBy(asc(pushTokens.createdAt));
}

async function currentSession(accessToken: string) {
  const listed = await api.client.call(listSessionsRoute, { accessToken });
  if (!listed.ok) throw new Error(listed.error.code);
  const current = listed.data.sessions.find((session) => session.current);
  if (current === undefined) throw new Error("No current session.");
  return current.id;
}

describe("PUT /v1/me/sessions/current/push-token", () => {
  it("stores this device's token, replaces it, and removes it with null", async () => {
    const gunna = await api.signIn(api.newPhoneNumber(), "android");
    const sessionId = await currentSession(gunna.accessToken);

    expect(await register(gunna.accessToken, token("first"))).toMatchObject({
      ok: true,
      status: 204,
    });
    expect(await stored()).toEqual([
      { userId: gunna.userId, sessionId, platform: "android", token: token("first") },
    ]);
    await register(gunna.accessToken, token("second"));
    expect((await stored()).map((row) => row.token)).toEqual([token("second")]);
    expect(await register(gunna.accessToken, null)).toMatchObject({ ok: true, status: 204 });
    expect(await stored()).toEqual([]);
    // Removing one that is not there is fine too.
    expect(await register(gunna.accessToken, null)).toMatchObject({ ok: true });
  });

  it("keeps one token per device: the same person's other devices keep theirs", async () => {
    const phone = api.newPhoneNumber();
    const onPhone = await api.signIn(phone, "ios");
    const onTablet = await api.signIn(phone, "android");
    await register(onPhone.accessToken, token("phone"));
    await register(onTablet.accessToken, token("tablet"));
    expect((await stored()).map((row) => row.token)).toEqual([token("phone"), token("tablet")]);
  });

  it("moves a token another session had to this one, so a device never gets two people's news", async () => {
    const gunna = await api.signIn(api.newPhoneNumber());
    await register(gunna.accessToken, token("shared-phone"));
    // Gunna's session lingers on the phone; Jón signs in on it.
    const jon = await api.signIn(api.newPhoneNumber());
    await register(jon.accessToken, token("shared-phone"));
    expect(await stored()).toEqual([
      expect.objectContaining({ userId: jon.userId, token: token("shared-phone") }),
    ]);
  });

  it("stores nothing for a session that ended on its way, as a sign-out at the same moment", async () => {
    const gunna = await api.signIn(api.newPhoneNumber());
    const sessionId = await currentSession(gunna.accessToken);
    await api.client.call(signOutRoute, { accessToken: gunna.accessToken, body: {} });
    await setPushToken(
      api.connection.db,
      { userId: gunna.userId, sessionId },
      token("late"),
      api.now(),
    );
    expect(await stored()).toEqual([]);
  });

  it("refuses anything but an Expo push token, and needs a signed-in device", async () => {
    const gunna = await api.signIn(api.newPhoneNumber());
    for (const value of [
      "",
      "fcm-token",
      "ExponentPushToken[]",
      `ExponentPushToken[${"x".repeat(200)}]`,
    ]) {
      expect(await register(gunna.accessToken, value)).toMatchObject({
        status: 400,
        error: { code: "validation_failed" },
      });
    }
    expect(await register(gunna.accessToken, "ExpoPushToken[abc-123]")).toMatchObject({ ok: true });
    const anonymous = await api.request("/v1/me/sessions/current/push-token", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token("nobody") }),
    });
    expect(anonymous.status).toBe(401);
  });
});

describe("a session that ends takes its push token with it", () => {
  it("when the device signs out, or signs out everywhere", async () => {
    const phone = api.newPhoneNumber();
    const one = await api.signIn(phone);
    const two = await api.signIn(phone);
    const three = await api.signIn(phone);
    await register(one.accessToken, token("one"));
    await register(two.accessToken, token("two"));
    await register(three.accessToken, token("three"));

    await api.client.call(signOutRoute, { accessToken: one.accessToken, body: {} });
    expect((await stored()).map((row) => row.token)).toEqual([token("two"), token("three")]);
    await api.client.call(signOutRoute, { accessToken: two.accessToken, body: { all: true } });
    expect(await stored()).toEqual([]);
  });

  it("when it is signed out from another device", async () => {
    const phone = api.newPhoneNumber();
    const old = await api.signIn(phone);
    await register(old.accessToken, token("old-phone"));
    const current = await api.signIn(phone);
    const oldSessionId = await currentSession(old.accessToken);
    await api.client.call(endSessionRoute, {
      accessToken: current.accessToken,
      params: { id: oldSessionId },
    });
    expect(await stored()).toEqual([]);
  });

  it("when it has been idle too long", async () => {
    const gunna = await api.signIn(api.newPhoneNumber());
    await register(gunna.accessToken, token("idle"));
    const sessionId = await currentSession(gunna.accessToken);
    await api.connection.db
      .update(sessions)
      .set({ lastActiveAt: new Date(api.now().getTime() - 61 * 24 * 3600 * 1000) })
      .where(eq(sessions.id, sessionId));
    await cleanUpSignInRecords(api.connection.db, api.now());
    expect(await stored()).toEqual([]);
  });
});
