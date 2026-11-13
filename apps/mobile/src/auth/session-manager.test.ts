import { createFakeClient, failure, ok, testMe, tokens } from "@/testing/fake-client";
import { memoryTokenStore as memoryStore } from "@/testing/memory-token-store";
import { createSessionManager } from "./session-manager";

const device = { platform: "ios", appVersion: "1.0.0" } as const;

describe("createSessionManager", () => {
  it("is signed out at start when no refresh token is stored", async () => {
    const client = createFakeClient();
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    await session.restore();
    expect(session.state()).toEqual({ status: "signedOut" });
    expect(client.calls).toEqual([]);
  });

  it("restores a session from the stored refresh token and keeps the new one", async () => {
    const client = createFakeClient();
    const store = memoryStore("sr_rt_old");
    client.answer("/v1/auth/refresh", () => ok(200, tokens(2)));
    client.answer("/v1/me", () => ok(200, testMe));
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.restore();
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
    expect(store.value).toBe("sr_rt_refresh-2");
    expect(client.calls[1]?.input["accessToken"]).toBe("sr_at_access-2");
  });

  it("on the web, refreshes with the cookie: no stored token, an empty body", async () => {
    const client = createFakeClient();
    client.answer("/v1/auth/refresh", () => ok(200, { ...tokens(1), refreshToken: undefined }));
    client.answer("/v1/me", () => ok(200, testMe));
    const session = createSessionManager({
      client,
      tokenStore: memoryStore(),
      device: { platform: "web" },
    });
    await session.restore();
    expect(client.calls[0]).toEqual({ path: "/v1/auth/refresh", input: { body: {} } });
    expect(session.state().status).toBe("signedIn");
  });

  it("signs in with a code and stores the refresh token", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: true }),
    );
    const session = createSessionManager({ client, tokenStore: store, device });
    const result = await session.verify("+3546900000", "123456", "en");
    expect(result.ok).toBe(true);
    expect(store.value).toBe("sr_rt_refresh-1");
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
    expect(client.calls[0]?.input["body"]).toMatchObject({ device });
  });

  it("refreshes once when the access token has expired, then repeats the call", async () => {
    const client = createFakeClient();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    client.answer("/v1/me", ({ accessToken }) =>
      accessToken === "sr_at_access-2" ? ok(200, testMe) : failure(401, "unauthenticated"),
    );
    client.answer("/v1/auth/refresh", () => ok(200, tokens(2)));
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    await session.verify("+3546900000", "123456", "en");

    const [first, second] = await Promise.all([session.me(), session.me()]);
    expect(first.ok && second.ok).toBe(true);
    expect(client.calls.filter((call) => call.path === "/v1/auth/refresh")).toHaveLength(1);
  });

  it("signs out when the refresh token no longer works", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    client.answer("/v1/me", () => failure(401, "unauthenticated"));
    client.answer("/v1/auth/refresh", () => failure(401, "session_ended"));
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.verify("+3546900000", "123456", "en");
    await session.me();
    expect(session.state()).toEqual({ status: "signedOut" });
    expect(store.value).toBeNull();
  });

  it("says the API is out of reach at start, keeps the token and tries again", async () => {
    const client = createFakeClient();
    const store = memoryStore("sr_rt_kept");
    client.answer("/v1/auth/refresh", () => failure(0, "network_error"));
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.restore();
    expect(session.state()).toEqual({ status: "unreachable" });
    expect(store.value).toBe("sr_rt_kept");

    client.answer("/v1/auth/refresh", () => ok(200, tokens(2)));
    client.answer("/v1/me", () => ok(200, testMe));
    await session.restore();
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
  });

  it.each([
    ["cannot be reached", failure(0, "network_error")],
    ["fails", failure(503, "internal_error")],
    ["limits requests", failure(429, "rate_limited")],
    ["answers with something unexpected", failure(502, "unexpected_response")],
  ])("stays signed in when the API %s during a refresh", async (_case, refreshFailure) => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    client.answer("/v1/me", () => failure(401, "unauthenticated"));
    client.answer("/v1/auth/refresh", () => refreshFailure);
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.verify("+3546900000", "123456", "en");
    const result = await session.me();
    expect(result).toMatchObject({ ok: false, error: { code: refreshFailure.error.code } });
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
    expect(store.value).toBe("sr_rt_refresh-1");
  });

  it("stays signed in when the secure storage fails to save the token", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    store.write = () => Promise.reject(new Error("Keychain unavailable"));
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: true }),
    );
    const session = createSessionManager({ client, tokenStore: store, device });
    const result = await session.verify("+3546900000", "123456", "en");
    expect(result.ok).toBe(true);
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
  });

  it("signs out on all devices and forgets the tokens", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    client.answer("/v1/auth/sign-out", () => ok(204));
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.verify("+3546900000", "123456", "en");
    await session.signOut({ all: true });
    expect(client.calls.at(-1)).toEqual({
      path: "/v1/auth/sign-out",
      input: { body: { all: true }, accessToken: "sr_at_access-1" },
    });
    expect(store.value).toBeNull();
    expect(session.state()).toEqual({ status: "signedOut" });
  });

  it("stays signed in when signing out on all devices is not confirmed", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    client.answer("/v1/auth/sign-out", () => failure(0, "network_error"));
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.verify("+3546900000", "123456", "en");
    const result = await session.signOut({ all: true });
    expect(result.ok).toBe(false);
    expect(store.value).toBe("sr_rt_refresh-1");
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
  });

  it("on the web, stays signed in when signing out is not confirmed (the cookie stays)", async () => {
    const client = createFakeClient();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), refreshToken: undefined, user: testMe, isNewUser: false }),
    );
    client.answer("/v1/auth/sign-out", () => failure(0, "network_error"));
    const session = createSessionManager({
      client,
      tokenStore: memoryStore(),
      device: { platform: "web" },
    });
    await session.verify("+3546900000", "123456", "en");
    const result = await session.signOut({ all: false });
    expect(result.ok).toBe(false);
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
  });

  it("signs out of this device even when the API cannot be reached", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    client.answer("/v1/auth/sign-out", () => failure(0, "network_error"));
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.verify("+3546900000", "123456", "en");
    await session.signOut({ all: false });
    expect(store.value).toBeNull();
    expect(session.state()).toEqual({ status: "signedOut" });
  });

  it("tells listeners about every change", async () => {
    const client = createFakeClient();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.state().status));
    await session.verify("+3546900000", "123456", "en");
    session.update({ ...testMe, firstName: "Anna" });
    expect(seen).toEqual(["signedIn", "signedIn"]);
    expect(session.state()).toMatchObject({ me: { firstName: "Anna" } });
  });
});
