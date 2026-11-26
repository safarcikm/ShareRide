import { createFakeClient, failure, ok, testMe, tokens } from "@/testing/fake-client";
import { memoryTokenStore as memoryStore } from "@/testing/memory-token-store";
import { createSessionManager } from "./session-manager";

const device = { platform: "ios", appVersion: "1.0.0" } as const;
const pendingEmail = `sr_pe_${"e".repeat(43)}`;

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
    const result = await session.verify(
      "+3546900000",
      "123456",
      "en",
      undefined,
      pendingEmail,
      "email",
    );
    expect(result.ok).toBe(true);
    expect(store.value).toBe("sr_rt_refresh-1");
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
    expect(client.calls[0]?.input["body"]).toMatchObject({ device });
  });

  it("sends a waiting Google or Apple sign-in with the code, and keeps what it said", async () => {
    const client = createFakeClient();
    const providerLink = { provider: "google", outcome: "linked", email: "anna@example.com" };
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false, providerLink }),
    );
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    expect(session.signInNews()).toBeNull();
    await session.verify(
      "+3546900000",
      "123456",
      "en",
      undefined,
      `sr_ps_${"p".repeat(43)}`,
      "google",
    );
    expect(client.calls[0]?.input["body"]).toMatchObject({
      pendingSignIn: `sr_ps_${"p".repeat(43)}`,
    });
    expect(session.signInNews()).toEqual({
      providerLink,
      emailLink: null,
      suggestedFirstName: null,
    });
    session.dismissLinkNotice();
    expect(session.signInNews()).toBeNull();
  });

  it("emails a code, and signs in with it when an account has the email (spec 26)", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/email/start", () => ok(202, { resendAfterSeconds: 30 }));
    client.answer("/v1/auth/email/verify", () =>
      ok(200, { status: "signedIn", ...tokens(1), user: testMe, isNewUser: false }),
    );
    const session = createSessionManager({ client, tokenStore: store, device });
    expect((await session.startEmail("anna@example.com", "is")).ok).toBe(true);
    const result = await session.verifyEmail("anna@example.com", "123456");
    expect(result.ok && result.data.status).toBe("signedIn");
    expect(client.calls.map((call) => call.input["body"])).toEqual([
      { email: "anna@example.com", locale: "is" },
      { email: "anna@example.com", code: "123456", device },
    ]);
    expect(store.value).toBe("sr_rt_refresh-1");
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
  });

  it("stays signed out when the email needs the phone step, and sends its waiting sign-in", async () => {
    const client = createFakeClient();
    const phoneNeeded = {
      status: "phoneNeeded",
      pendingSignIn: pendingEmail,
      provider: "email",
      email: "anna@example.com",
      firstName: null,
      expiresAt: "2026-11-23T12:30:00.000Z",
    };
    client.answer("/v1/auth/email/verify", () => ok(200, phoneNeeded));
    client.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    await session.restore();
    const result = await session.verifyEmail("anna@example.com", "123456");
    expect(result.ok && result.data).toEqual(phoneNeeded);
    expect(session.state()).toEqual({ status: "signedOut" });
    await session.start("+3546900000", "en", pendingEmail);
    expect(client.calls.at(-1)?.input["body"]).toEqual({
      phoneNumber: "+3546900000",
      locale: "en",
      pendingSignIn: pendingEmail,
    });
  });

  it("tells of an email added or put in place at the phone step, not of a new account's", async () => {
    const client = createFakeClient();
    let outcome = "replaced";
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, {
        ...tokens(1),
        user: testMe,
        isNewUser: outcome === "created",
        emailLink: { outcome, email: "anna@example.com" },
      }),
    );
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
    expect(session.signInNews()).toEqual({
      providerLink: null,
      emailLink: { outcome: "replaced", email: "anna@example.com" },
      suggestedFirstName: null,
    });
    session.dismissLinkNotice();
    expect(session.signInNews()).toBeNull();
    outcome = "created";
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
    expect(session.signInNews()).toBeNull();
  });

  it("keeps a new account's first name from Google or Apple for step 3, until signed out", async () => {
    const client = createFakeClient();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, {
        ...tokens(1),
        user: testMe,
        isNewUser: true,
        providerLink: { provider: "apple", outcome: "created", email: null },
        suggestedFirstName: "Anna",
      }),
    );
    client.answer("/v1/auth/sign-out", () => ok(204));
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    await session.verify(
      "+3546900000",
      "123456",
      "en",
      undefined,
      `sr_ps_${"p".repeat(43)}`,
      "google",
    );
    // "created" needs no notice: the new account is the news.
    expect(session.signInNews()).toEqual({
      providerLink: null,
      emailLink: null,
      suggestedFirstName: "Anna",
    });
    await session.signOut({ all: false });
    expect(session.signInNews()).toBeNull();
  });

  it("finishes a Google or Apple sign-in with the ticket and the verifier", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/oauth/finish", () =>
      ok(200, { status: "signedIn", ...tokens(1), user: testMe, isNewUser: false }),
    );
    const session = createSessionManager({ client, tokenStore: store, device });
    const result = await session.finishProviderSignIn(
      `sr_pt_${"t".repeat(43)}`,
      "v".repeat(43),
      "google",
    );
    expect(result.ok && result.data.status).toBe("signedIn");
    expect(client.calls[0]).toEqual({
      path: "/v1/auth/oauth/finish",
      input: { body: { ticket: `sr_pt_${"t".repeat(43)}`, verifier: "v".repeat(43), device } },
    });
    expect(store.value).toBe("sr_rt_refresh-1");
    expect(session.state()).toEqual({ status: "signedIn", me: testMe });
    expect(session.signInNews()).toBeNull();
  });

  it("stays signed out when Google or Apple needs the phone step first", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    const phoneNeeded = {
      status: "phoneNeeded",
      pendingSignIn: `sr_ps_${"p".repeat(43)}`,
      provider: "google",
      email: "anna@example.com",
      firstName: "Anna",
      expiresAt: "2026-11-22T12:30:00.000Z",
    };
    client.answer("/v1/auth/oauth/finish", () => ok(200, phoneNeeded));
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.restore();
    const result = await session.finishProviderSignIn(
      `sr_pt_${"t".repeat(43)}`,
      "v".repeat(43),
      "google",
    );
    expect(result.ok && result.data).toEqual(phoneNeeded);
    expect(store.value).toBeNull();
    expect(session.state()).toEqual({ status: "signedOut" });
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
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");

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
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
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
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
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
    const result = await session.verify(
      "+3546900000",
      "123456",
      "en",
      undefined,
      pendingEmail,
      "email",
    );
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
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
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
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
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
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
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
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
    await session.signOut({ all: false });
    expect(store.value).toBeNull();
    expect(session.state()).toEqual({ status: "signedOut" });
  });

  it("forgets the tokens without a call when the API ended the session itself", async () => {
    const client = createFakeClient();
    const store = memoryStore();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    const session = createSessionManager({ client, tokenStore: store, device });
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
    await session.ended();
    expect(store.value).toBeNull();
    expect(session.state()).toEqual({ status: "signedOut" });
    expect(client.calls.map((call) => call.path)).toEqual(["/v1/auth/phone/verify"]);
  });

  it("tells listeners about every change", async () => {
    const client = createFakeClient();
    client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: testMe, isNewUser: false }),
    );
    const session = createSessionManager({ client, tokenStore: memoryStore(), device });
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.state().status));
    await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
    session.update({ ...testMe, firstName: "Anna" });
    expect(seen).toEqual(["signedIn", "signedIn"]);
    expect(session.state()).toMatchObject({ me: { firstName: "Anna" } });
  });

  describe("what the last sign-in was (spec 28, 3.2 and 3.5)", () => {
    const passkeyAnswer = {
      id: "credential-one",
      rawId: "credential-one",
      type: "public-key" as const,
      response: { clientDataJSON: "data", authenticatorData: "auth", signature: "sig" },
      clientExtensionResults: {},
    };
    const signedIn = (isNewUser: boolean) => ok(200, { ...tokens(1), user: testMe, isNewUser });

    it("is known before the state turns signed in, and taken once", async () => {
      const client = createFakeClient();
      client.answer("/v1/auth/email/verify", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: testMe, isNewUser: false }),
      );
      const session = createSessionManager({ client, tokenStore: memoryStore(), device });
      const seen: unknown[] = [];
      session.subscribe(() => {
        if (session.state().status === "signedIn") seen.push(session.takeJustSignedIn());
      });
      await session.verifyEmail("anna@example.com", "123456");
      expect(seen).toEqual([{ way: "email", isNewUser: false, credentialId: null }]);
      expect(session.takeJustSignedIn()).toBeNull();
    });

    it("says a password", async () => {
      const client = createFakeClient();
      client.answer("/v1/auth/password", () => signedIn(false));
      const session = createSessionManager({ client, tokenStore: memoryStore(), device });
      await session.signInWithPassword("anna@example.com", "puffins fly north");
      expect(session.takeJustSignedIn()).toEqual({
        way: "password",
        isNewUser: false,
        credentialId: null,
      });
    });

    it("says a passkey, with its credential ID", async () => {
      const client = createFakeClient();
      client.answer("/v1/auth/passkey", () => signedIn(false));
      const session = createSessionManager({ client, tokenStore: memoryStore(), device });
      await session.signInWithPasskey(passkeyAnswer);
      expect(session.takeJustSignedIn()).toEqual({
        way: "passkey",
        isNewUser: false,
        credentialId: "credential-one",
      });
    });

    it("says Google or Apple, as the window was", async () => {
      const client = createFakeClient();
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: testMe, isNewUser: false }),
      );
      const session = createSessionManager({ client, tokenStore: memoryStore(), device });
      await session.finishProviderSignIn(`sr_pt_${"t".repeat(43)}`, "v".repeat(43), "apple");
      expect(session.takeJustSignedIn()).toEqual({
        way: "apple",
        isNewUser: false,
        credentialId: null,
      });
    });

    it("says the way the phone step started from, and a new account", async () => {
      const client = createFakeClient();
      client.answer("/v1/auth/phone/verify", () => signedIn(true));
      const session = createSessionManager({ client, tokenStore: memoryStore(), device });
      await session.verify("+3546900000", "123456", "en", undefined, pendingEmail, "email");
      expect(session.takeJustSignedIn()).toEqual({
        way: "email",
        isNewUser: true,
        credentialId: null,
      });
    });

    it("says nothing after a session restored at start, or one refused", async () => {
      const client = createFakeClient();
      client.answer("/v1/auth/refresh", () => ok(200, tokens(2)));
      client.answer("/v1/me", () => ok(200, testMe));
      client.answer("/v1/auth/password", () => failure(401, "credentials_invalid"));
      const session = createSessionManager({
        client,
        tokenStore: memoryStore("sr_rt_old"),
        device,
      });
      await session.restore();
      await session.signInWithPassword("anna@example.com", "wrong one");
      expect(session.takeJustSignedIn()).toBeNull();
    });

    it("is forgotten on signing out", async () => {
      const client = createFakeClient();
      client.answer("/v1/auth/password", () => signedIn(false));
      client.answer("/v1/auth/sign-out", () => ok(204));
      const session = createSessionManager({ client, tokenStore: memoryStore(), device });
      await session.signInWithPassword("anna@example.com", "puffins fly north");
      await session.signOut({ all: false });
      expect(session.takeJustSignedIn()).toBeNull();
    });
  });
});
