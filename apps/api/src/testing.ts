// Helpers for integration tests: a real database, a clock the test moves,
// and the development SMS sender. Never import this from application code.
import { Writable } from "node:stream";
import { createApiClient, type ApiClient } from "@shareride/api-client";
import { startPhoneSignInRoute, verifyPhoneCodeRoute } from "@shareride/contracts";
import { pingDatabase, type DatabaseConnection } from "@shareride/db";
import { seedDraftLegalDocuments } from "@shareride/db/seed";
import { freshTestDatabase } from "@shareride/db/testing";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import { createKeyedHasher } from "./platform/crypto.ts";
import { createDevSmsSender, type DevSmsSender } from "./platform/sms.ts";

export interface TestApi {
  readonly connection: DatabaseConnection;
  readonly client: ApiClient;
  /** Requests straight to the app, for headers and cookies. */
  request(path: string, init?: RequestInit): Promise<Response>;
  readonly sms: DevSmsSender;
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
  close(): Promise<void>;
}

let numbers = 0;
let addresses = 0;

export async function startTestApi(): Promise<TestApi> {
  const connection = await freshTestDatabase();
  let now = new Date("2026-11-13T12:00:00.000Z");
  await seedDraftLegalDocuments(connection.db, new Date("2026-11-01T00:00:00.000Z"));
  const sms = createDevSmsSender({ print: () => undefined });
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

  const app = createApp({
    logger,
    checkDatabase: () => pingDatabase(connection.pool),
    features: {
      db: connection.db,
      sms,
      hasher: createKeyedHasher("integration-test-secret-of-32-characters"),
      clock: () => now,
      clientAddress: (c) => c.req.header("x-test-client-ip") ?? "unknown",
      secureCookies: false,
    },
  });

  const api: TestApi = {
    connection,
    sms,
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
    close: () => connection.close(),
  };
  return api;
}
