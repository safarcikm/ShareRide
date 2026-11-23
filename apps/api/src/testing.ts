// Helpers for integration tests: a real database, a clock the test moves,
// and the development SMS sender. Never import this from application code.
import { Writable } from "node:stream";
import { createApiClient, type ApiClient } from "@shareride/api-client";
import {
  startEmailSignInRoute,
  startPhoneSignInRoute,
  verifyEmailCodeRoute,
  verifyPhoneCodeRoute,
} from "@shareride/contracts";
import { pingDatabase, schema, type DatabaseConnection } from "@shareride/db";
import { seedDraftLegalDocuments } from "@shareride/db/seed";
import { freshTestDatabase } from "@shareride/db/testing";
import { operatorRole, type SettingKey } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { createApp, type FeatureDependencies } from "./app.ts";
import { createLogger } from "./logger.ts";
import { createOperatorSessionService, operatorCookie } from "./modules/admin/index.ts";
import { createSearchLog, type SearchLog } from "./modules/metrics/index.ts";
import { exportCipherPurpose } from "./modules/privacy/index.ts";
import { createFileCipher, createKeyedHasher } from "./platform/crypto.ts";
import { createFakeEmailSender, type FakeEmailSender } from "./platform/email.ts";
import { createTestPaymentProvider } from "./platform/payments.ts";
import { createDevProvider } from "./platform/identity-providers.ts";
import { createFakePhotoStorage, type FakePhotoStorage } from "./platform/photo-storage.ts";
import { createStraightLineRouter } from "./platform/router.ts";
import { createDevSmsSender, type DevSmsSender, type SmsSender } from "./platform/sms.ts";

export interface TestApi {
  readonly connection: DatabaseConnection;
  /** What the app was given, for a test that builds another app on the same database. */
  readonly features: FeatureDependencies;
  readonly client: ApiClient;
  /** Requests straight to the app, for headers and cookies. */
  request(path: string, init?: RequestInit): Promise<Response>;
  readonly sms: DevSmsSender;
  /** The emails sent from requests, such as links to verify an address. */
  readonly email: FakeEmailSender;
  /** The search log: `idle()` waits for the rows of the searches answered so far. */
  readonly searchLog: SearchLog;
  /** Meeting point photos' files, kept in memory. */
  readonly photos: FakePhotoStorage;
  /** While set, sending fails with this error after the message reaches `sms.outbox`. */
  smsFailure: Error | null;
  /** Every log line written so far. */
  readonly logLines: string[];
  now(): Date;
  /** Moves the clock forward. */
  advance(seconds: number): void;
  /** The IP address the next requests come from. */
  ip: string;
  /** The last code sent to this number. */
  lastCode(e164: string): string;
  /** The last code emailed to this address. */
  lastEmailCode(address: string): string;
  /**
   * Proves an email no account has with its code, from an IP address of
   * its own, and gives the waiting sign-in for the phone step (spec 26,
   * 3.3). The code email stays in `email.sent`.
   */
  waitingEmailSignIn(address?: string): Promise<string>;
  /** A new, unused Icelandic mobile number. */
  newPhoneNumber(): string;
  /**
   * Signs in as the number's account from a new IP address, 31 seconds
   * later, the way the app does (spec 26): with the account's verified
   * email and its code, or else through the phone step with an email made
   * from the number, which the account then does not keep. So an account
   * made here has no email, as before spec 26, and the code emails are
   * taken out of `email.sent` again; the phone step's text stays in
   * `sms.outbox`.
   */
  signIn(
    e164: string,
    platform?: "ios" | "android" | "web",
  ): Promise<{ accessToken: string; refreshToken: string; userId: string; isNewUser: boolean }>;
  /**
   * Signs in a new account, gives it the operator role and opens a console
   * session for it without a passkey, for tests of console routes. Send
   * `cookie` as the request's Cookie header.
   */
  signInOperator(): Promise<{ userId: string; sessionId: string; cookie: string }>;
  /**
   * From here on the setting `invite_code_required` is as stored (off by
   * default, ADR 0035): for tests about the gate, which turn it on as the
   * operator does. Until then tests sign up without a code whatever is
   * stored.
   */
  useStoredInviteSetting(): void;
  /**
   * Holds one of the operator's settings at a value whatever is stored, or
   * lets it go again with `undefined`: for a test of one module's refusal
   * while a switch is off. Nothing that follows a real change happens.
   */
  fixSetting(key: SettingKey, value: number | undefined): void;
  close(): Promise<void>;
}

/** Where links in emails lead in integration tests. */
export const testWebAppUrl = "https://shareride.test";
/** The console origin passkeys are bound to in tests (ADR 0028). */
export const testAdminOrigin = "https://shareride.test";
/** The console's temporary password in tests (ADR 0041). */
export const testAdminPassword = "integration test console password";
/** Where the browser reaches the API in tests, for Google's and Apple's way back. */
export const testApiOrigin = "http://api.test";

let numbers = 0;
let addresses = 0;

export async function startTestApi(): Promise<TestApi> {
  const connection = await freshTestDatabase();
  let now = new Date("2026-11-13T12:00:00.000Z");
  await seedDraftLegalDocuments(connection.db, new Date("2026-11-01T00:00:00.000Z"));
  const sms = createDevSmsSender({ print: () => undefined });
  const failing: { error: Error | null } = { error: null };
  const sender: SmsSender = {
    async send(message) {
      await sms.send(message);
      if (failing.error !== null) throw failing.error;
    },
  };
  const logLines: string[] = [];
  const logger = createLogger({
    level: "debug",
    destination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    }),
  });

  // The invite gate is held off, so tests sign up without an invite code
  // even after one of them turns it on.
  const fixedSettings: Partial<Record<SettingKey, number>> = { invite_code_required: 0 };
  const email = createFakeEmailSender();
  const photos = createFakePhotoStorage();
  const searchLog = createSearchLog({ db: connection.db, clock: () => now, logger });
  const features: FeatureDependencies = {
    db: connection.db,
    searchLog,
    sms: sender,
    email: { sender: email, webAppUrl: testWebAppUrl },
    hasher: createKeyedHasher("integration-test-secret-of-32-characters"),
    exportCipher: createFileCipher("integration-test-secret-of-32-characters", exportCipherPurpose),
    clock: () => now,
    clientAddress: (c) => c.req.header("x-test-client-ip") ?? "unknown",
    secureCookies: false,
    payments: createTestPaymentProvider(),
    adminOrigin: testAdminOrigin,
    adminPassword: testAdminPassword,
    passkeyOrigin: testWebAppUrl,
    photos,
    // Legs on straight lines; south of 63.3° N, at sea off the south coast, there is no road.
    router: createStraightLineRouter({ offRoad: (position) => position.latitude < 63.3 }),
    fixedSettings,
    // Google and Apple through the development stand-in (ADR 0034).
    signIn: {
      providers: [
        createDevProvider({ name: "google", apiOrigin: testApiOrigin }),
        createDevProvider({ name: "apple", apiOrigin: testApiOrigin }),
      ],
      apiOrigin: testApiOrigin,
      returnUrls: { webOrigins: [testWebAppUrl], appScheme: "puffinride", allowExpoGo: true },
    },
  };
  const app = createApp({
    logger,
    checkDatabase: () => pingDatabase(connection.pool),
    features,
  });

  const api: TestApi = {
    connection,
    features,
    sms,
    email,
    searchLog,
    photos,
    get smsFailure() {
      return failing.error;
    },
    set smsFailure(error) {
      failing.error = error;
    },
    logLines,
    ip: "192.0.2.1",
    client: createApiClient({
      baseUrl: "http://api.test",
      fetch: (input, init) => api.request(input.replace("http://api.test", ""), init),
    }),
    async request(path, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("x-test-client-ip", api.ip);
      return app.request(path, { ...init, headers });
    },
    now: () => now,
    advance(seconds) {
      now = new Date(now.getTime() + seconds * 1000);
    },
    lastCode(e164) {
      const message = sms.outbox.findLast((candidate) => candidate.to === e164);
      const code = message?.text.match(/\d{6}/)?.[0];
      if (code === undefined) throw new Error("No code was sent to this number.");
      return code;
    },
    lastEmailCode(address) {
      const message = email.sent.findLast((candidate) => candidate.to === address);
      const code = message?.subject.match(/^\d{6}/)?.[0];
      if (code === undefined) throw new Error("No code was emailed to this address.");
      return code;
    },
    async waitingEmailSignIn(address) {
      addresses += 1;
      // From an address of its own, so the test's own address counts only what the test sends.
      const ip = api.ip;
      api.ip = `198.51.${String(101 + Math.floor(addresses / 250))}.${String(addresses % 250)}`;
      const to = address ?? `waiting-${String(addresses)}@example.test`;
      try {
        const started = await api.client.call(startEmailSignInRoute, {
          body: { email: to, locale: "en" },
        });
        if (!started.ok) throw new Error(`email start failed: ${started.error.code}`);
        const verified = await api.client.call(verifyEmailCodeRoute, {
          body: { email: to, code: api.lastEmailCode(to), device: { platform: "ios" } },
        });
        if (!verified.ok) throw new Error(`email verify failed: ${verified.error.code}`);
        if (verified.data.status !== "phoneNeeded") throw new Error("This email has an account.");
        return verified.data.pendingSignIn;
      } finally {
        api.ip = ip;
      }
    },
    newPhoneNumber() {
      numbers += 1;
      return `+35469${String(numbers).padStart(5, "0")}`;
    },
    async signIn(e164, platform = "ios") {
      api.advance(31);
      addresses += 1;
      api.ip = `198.51.100.${String(addresses % 250)}`;
      const device = { platform, name: "Test phone", appVersion: "1.0.0" };
      const [account] = await connection.db
        .select({ email: schema.users.email, emailVerifiedAt: schema.users.emailVerifiedAt })
        .from(schema.users)
        .where(eq(schema.users.phoneE164, e164));
      const known =
        account === undefined || account.emailVerifiedAt === null ? null : account.email;
      const address = known ?? `sign-in-${e164.slice(1)}@example.test`;
      const sentBefore = email.sent.length;
      const started = await api.client.call(startEmailSignInRoute, {
        body: { email: address, locale: "en" },
      });
      if (!started.ok) throw new Error(`email start failed: ${started.error.code}`);
      const byEmail = await api.client.call(verifyEmailCodeRoute, {
        body: { email: address, code: api.lastEmailCode(address), device },
      });
      // The helper's own code email: other tests count what their code sends.
      email.sent.splice(sentBefore, 1);
      if (!byEmail.ok) throw new Error(`email verify failed: ${byEmail.error.code}`);
      if (byEmail.data.status === "signedIn") {
        const { accessToken, refreshToken, user } = byEmail.data;
        return { accessToken, refreshToken: refreshToken ?? "", userId: user.id, isNewUser: false };
      }
      const { pendingSignIn } = byEmail.data;
      const texted = await api.client.call(startPhoneSignInRoute, {
        body: { phoneNumber: e164, locale: "en", pendingSignIn },
      });
      if (!texted.ok) throw new Error(`start failed: ${texted.error.code}`);
      const verified = await api.client.call(verifyPhoneCodeRoute, {
        body: { phoneNumber: e164, code: api.lastCode(e164), locale: "en", device, pendingSignIn },
      });
      if (!verified.ok) throw new Error(`verify failed: ${verified.error.code}`);
      const { accessToken, refreshToken, user, isNewUser } = verified.data;
      // The account keeps the email it had: none for one made here.
      await connection.db
        .update(schema.users)
        .set({ email: account?.email ?? null, emailVerifiedAt: account?.emailVerifiedAt ?? null })
        .where(eq(schema.users.id, user.id));
      return { accessToken, refreshToken: refreshToken ?? "", userId: user.id, isNewUser };
    },
    async signInOperator() {
      const { userId } = await api.signIn(api.newPhoneNumber());
      await connection.db
        .update(schema.users)
        .set({ roles: [operatorRole] })
        .where(eq(schema.users.id, userId));
      const session = await createOperatorSessionService(features).start({
        userId,
        device: "Test browser",
      });
      return {
        userId,
        sessionId: session.sessionId,
        cookie: `${operatorCookie.name}=${session.token}`,
      };
    },
    useStoredInviteSetting() {
      delete fixedSettings.invite_code_required;
    },
    fixSetting(key, value) {
      if (value === undefined) Reflect.deleteProperty(fixedSettings, key);
      else fixedSettings[key] = value;
    },
    close: () => connection.close(),
  };
  return api;
}
