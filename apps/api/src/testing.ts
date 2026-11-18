// Helpers for integration tests: a real database, a clock the test moves,
// and the development SMS sender. Never import this from application code.
import { Writable } from "node:stream";
import { createApiClient, type ApiClient } from "@shareride/api-client";
import { startPhoneSignInRoute, verifyPhoneCodeRoute } from "@shareride/contracts";
import { pingDatabase, schema, type DatabaseConnection } from "@shareride/db";
import { seedDraftLegalDocuments } from "@shareride/db/seed";
import { freshTestDatabase } from "@shareride/db/testing";
import { operatorRole } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { createApp, type FeatureDependencies } from "./app.ts";
import { createLogger } from "./logger.ts";
import { createOperatorSessionService, operatorCookie } from "./modules/admin/index.ts";
import { exportCipherPurpose } from "./modules/privacy/index.ts";
import { createFileCipher, createKeyedHasher } from "./platform/crypto.ts";
import { createFakeEmailSender, type FakeEmailSender } from "./platform/email.ts";
import { createTestPaymentProvider } from "./platform/payments.ts";
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
  /** A new, unused Icelandic mobile number. */
  newPhoneNumber(): string;
  /** Sends a code and signs in with it, from a new IP address, 31 seconds later. */
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
   * From here on the setting `invite_code_required` is as stored (on by
   * default), so a new account needs an invite code: for tests about the
   * closed beta. Until then tests sign up without one.
   */
  useStoredInviteSetting(): void;
  close(): Promise<void>;
}

/** Where links in emails lead in integration tests. */
export const testWebAppUrl = "https://shareride.test";
/** The console origin passkeys are bound to in tests (ADR 0028). */
export const testAdminOrigin = "https://shareride.test";

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

  // The closed beta's gate is off, so tests sign up without an invite code.
  const fixedSettings: { invite_code_required?: number } = { invite_code_required: 0 };
  const email = createFakeEmailSender();
  const photos = createFakePhotoStorage();
  const features: FeatureDependencies = {
    db: connection.db,
    sms: sender,
    email: { sender: email, webAppUrl: testWebAppUrl },
    hasher: createKeyedHasher("integration-test-secret-of-32-characters"),
    exportCipher: createFileCipher("integration-test-secret-of-32-characters", exportCipherPurpose),
    clock: () => now,
    clientAddress: (c) => c.req.header("x-test-client-ip") ?? "unknown",
    secureCookies: false,
    payments: createTestPaymentProvider(),
    adminOrigin: testAdminOrigin,
    photos,
    // Legs on straight lines; south of 63.3° N, at sea off the south coast, there is no road.
    router: createStraightLineRouter({ offRoad: (position) => position.latitude < 63.3 }),
    fixedSettings,
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
    newPhoneNumber() {
      numbers += 1;
      return `+35469${String(numbers).padStart(5, "0")}`;
    },
    async signIn(e164, platform = "ios") {
      api.advance(31);
      addresses += 1;
      api.ip = `198.51.100.${String(addresses % 250)}`;
      const started = await api.client.call(startPhoneSignInRoute, {
        body: { phoneNumber: e164, locale: "en" },
      });
      if (!started.ok) throw new Error(`start failed: ${started.error.code}`);
      const verified = await api.client.call(verifyPhoneCodeRoute, {
        body: {
          phoneNumber: e164,
          code: api.lastCode(e164),
          locale: "en",
          device: { platform, name: "Test phone", appVersion: "1.0.0" },
        },
      });
      if (!verified.ok) throw new Error(`verify failed: ${verified.error.code}`);
      const { accessToken, refreshToken, user, isNewUser } = verified.data;
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
    close: () => connection.close(),
  };
  return api;
}
