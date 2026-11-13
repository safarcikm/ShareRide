import {
  endSessionRoute,
  getMeRoute,
  listSessionsRoute,
  refreshRoute,
  signOutRoute,
} from "@shareride/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

const me = (accessToken: string) => api.client.call(getMeRoute, { accessToken });
const refresh = (refreshToken: string) => api.client.call(refreshRoute, { body: { refreshToken } });

async function refreshed(refreshToken: string) {
  const result = await refresh(refreshToken);
  if (!result.ok) throw new Error(`refresh failed: ${result.error.code}`);
  return { accessToken: result.data.accessToken, refreshToken: result.data.refreshToken ?? "" };
}

describe("access tokens", () => {
  it("are needed for my account", async () => {
    const response = await api.request("/v1/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="shareride"');
    expect(await response.json()).toMatchObject({ error: { code: "unauthenticated" } });
    expect(await me("sr_at_not-a-real-token")).toMatchObject({
      status: 401,
      error: { code: "unauthenticated" },
    });
  });

  it("last 15 minutes", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    api.advance(14 * 60);
    expect((await me(accessToken)).ok).toBe(true);
    api.advance(60);
    expect(await me(accessToken)).toMatchObject({ status: 401 });
  });

  it("are stored only as hashes", async () => {
    const { accessToken, refreshToken } = await api.signIn(api.newPhoneNumber());
    const { rows } = await api.connection.pool.query("SELECT token_hash FROM session_tokens");
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(accessToken.slice(6));
    expect(stored).not.toContain(refreshToken.slice(6));
  });
});

describe("refresh (ADR 0016)", () => {
  it("rotates both tokens; the old access token stops working", async () => {
    const first = await api.signIn(api.newPhoneNumber());
    const second = await refreshed(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await me(first.accessToken)).toMatchObject({ status: 401 });
    expect((await me(second.accessToken)).ok).toBe(true);
    const third = await refreshed(second.refreshToken);
    expect((await me(third.accessToken)).ok).toBe(true);
  });

  it("accepts a retry of the previous token within 30 seconds, after a lost reply", async () => {
    const first = await api.signIn(api.newPhoneNumber());
    const lost = await refreshed(first.refreshToken);
    api.advance(20);
    const retried = await refreshed(first.refreshToken);
    expect((await me(retried.accessToken)).ok).toBe(true);
    // The tokens from the lost reply are retired.
    expect(await me(lost.accessToken)).toMatchObject({ status: 401 });
    // The session carries on.
    const next = await refreshed(retried.refreshToken);
    expect((await me(next.accessToken)).ok).toBe(true);
  });

  it("ends the session when an old refresh token is used again", async () => {
    const first = await api.signIn(api.newPhoneNumber());
    const second = await refreshed(first.refreshToken);
    api.advance(31);
    expect(await refresh(first.refreshToken)).toMatchObject({
      status: 401,
      error: { code: "session_ended" },
    });
    expect(await me(second.accessToken)).toMatchObject({ status: 401 });
    expect(await refresh(second.refreshToken)).toMatchObject({ status: 401 });
    expect(api.logLines.some((line) => line.includes("refresh token reused"))).toBe(true);
  });

  it("ends the session when a token two rotations old comes back, even within 30 seconds", async () => {
    const first = await api.signIn(api.newPhoneNumber());
    const second = await refreshed(first.refreshToken);
    await refreshed(second.refreshToken);
    expect(await refresh(first.refreshToken)).toMatchObject({
      error: { code: "session_ended" },
    });
  });

  it("expires after 60 days without use, and each use starts the 60 days again", async () => {
    const first = await api.signIn(api.newPhoneNumber());
    api.advance(59 * 24 * 3600);
    const second = await refreshed(first.refreshToken);
    api.advance(59 * 24 * 3600);
    const third = await refreshed(second.refreshToken);
    api.advance(60 * 24 * 3600);
    expect(await refresh(third.refreshToken)).toMatchObject({
      status: 401,
      error: { code: "session_ended" },
    });
  });

  it("ends the session of a suspended account", async () => {
    const { userId, refreshToken } = await api.signIn(api.newPhoneNumber());
    await api.connection.pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [
      userId,
    ]);
    expect(await refresh(refreshToken)).toMatchObject({
      status: 401,
      error: { code: "session_ended" },
    });
  });

  it("refuses an unknown token", async () => {
    expect(await refresh("sr_rt_unknown")).toMatchObject({
      status: 401,
      error: { code: "refresh_invalid" },
    });
  });
});

describe("sign out and devices", () => {
  it("signs out this device only", async () => {
    const phone = api.newPhoneNumber();
    const phoneSession = await api.signIn(phone);
    const tabletSession = await api.signIn(phone, "android");
    const result = await api.client.call(signOutRoute, {
      body: {},
      accessToken: phoneSession.accessToken,
    });
    expect(result).toEqual({ ok: true, status: 204, data: undefined });
    expect(await me(phoneSession.accessToken)).toMatchObject({ status: 401 });
    expect(await refresh(phoneSession.refreshToken)).toMatchObject({ status: 401 });
    expect((await me(tabletSession.accessToken)).ok).toBe(true);
  });

  it("signs out on all devices", async () => {
    const phone = api.newPhoneNumber();
    const one = await api.signIn(phone);
    const two = await api.signIn(phone, "android");
    await api.client.call(signOutRoute, { body: { all: true }, accessToken: one.accessToken });
    expect(await me(one.accessToken)).toMatchObject({ status: 401 });
    expect(await me(two.accessToken)).toMatchObject({ status: 401 });
    expect(await refresh(two.refreshToken)).toMatchObject({ status: 401 });
  });

  it("lists my signed-in devices, newest activity first, and marks this one", async () => {
    const phone = api.newPhoneNumber();
    const older = await api.signIn(phone, "android");
    const newer = await api.signIn(phone);
    const result = await api.client.call(listSessionsRoute, { accessToken: newer.accessToken });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.sessions).toHaveLength(2);
    expect(result.data.sessions.map((session) => [session.platform, session.current])).toEqual([
      ["ios", true],
      ["android", false],
    ]);
    expect(result.data.sessions[0]).toMatchObject({
      deviceName: "Test phone",
      appVersion: "1.0.0",
    });
    expect((await me(older.accessToken)).ok).toBe(true);
  });

  it("signs out another of my devices", async () => {
    const phone = api.newPhoneNumber();
    const other = await api.signIn(phone, "android");
    const mine = await api.signIn(phone);
    const list = await api.client.call(listSessionsRoute, { accessToken: mine.accessToken });
    if (!list.ok) throw new Error(list.error.code);
    const target = list.data.sessions.find((session) => !session.current);
    if (target === undefined) throw new Error("no other session");

    const ended = await api.client.call(endSessionRoute, {
      params: { id: target.id },
      accessToken: mine.accessToken,
    });
    expect(ended).toMatchObject({ ok: true, status: 204 });
    expect(await me(other.accessToken)).toMatchObject({ status: 401 });
    expect((await me(mine.accessToken)).ok).toBe(true);
  });

  it("cannot end another person's session", async () => {
    const victim = await api.signIn(api.newPhoneNumber());
    const attacker = await api.signIn(api.newPhoneNumber());
    const list = await api.client.call(listSessionsRoute, { accessToken: victim.accessToken });
    if (!list.ok) throw new Error(list.error.code);
    const victimSession = list.data.sessions[0]?.id ?? "";

    const result = await api.client.call(endSessionRoute, {
      params: { id: victimSession },
      accessToken: attacker.accessToken,
    });
    expect(result).toMatchObject({ status: 404, error: { code: "not_found" } });
    expect((await me(victim.accessToken)).ok).toBe(true);
  });
});

describe("on the web", () => {
  async function webSignIn() {
    const phone = api.newPhoneNumber();
    api.advance(31);
    api.ip = "192.0.2.90";
    await api.request("/v1/auth/phone/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone, locale: "en" }),
    });
    return api.request("/v1/auth/phone/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phoneNumber: phone,
        code: api.lastCode(phone),
        locale: "en",
        device: { platform: "web" },
      }),
    });
  }

  const cookieOf = (response: Response) =>
    /sr_refresh=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1] ?? "";

  it("keeps the refresh token in an HTTP-only cookie, not in the body", async () => {
    const response = await webSignIn();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["refreshToken"]).toBeUndefined();
    expect(body["accessToken"]).toMatch(/^sr_at_/);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^sr_refresh=sr_rt_/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/v1/auth");
    expect(cookie).toContain(`Max-Age=${String(60 * 24 * 3600)}`);
  });

  it("refreshes with the cookie and sets a new one", async () => {
    const signedIn = await webSignIn();
    const response = await api.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sr_refresh=${cookieOf(signedIn)}` },
      body: "{}",
    });
    expect(response.status).toBe(200);
    const next = cookieOf(response);
    expect(next).toMatch(/^sr_rt_/);
    expect(next).not.toBe(cookieOf(signedIn));
    expect(((await response.json()) as Record<string, unknown>)["refreshToken"]).toBeUndefined();
  });

  it("ignores a form posted from another page, so the cookie is not rotated", async () => {
    const signedIn = await webSignIn();
    const cookie = `sr_refresh=${cookieOf(signedIn)}`;
    const forged = await api.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: "",
    });
    expect(forged.status).toBe(415);
    const genuine = await api.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    });
    expect(genuine.status).toBe(200);
  });

  it("clears the cookie on sign-out", async () => {
    const signedIn = await webSignIn();
    const { accessToken } = (await signedIn.json()) as { accessToken: string };
    const response = await api.request("/v1/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: "{}",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/^sr_refresh=;.*Max-Age=0/);
  });
});
