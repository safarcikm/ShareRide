import type { Database } from "@shareride/db";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { createKeyedHasher } from "../../platform/crypto.ts";
import { createDevProvider, pkceChallenge } from "../../platform/identity-providers.ts";
import { createMemoryRateLimiter } from "../../platform/memory-rate-limiter.ts";
import { createProviderSignInService } from "./provider-sign-in.ts";
import type { AuthService } from "./service.ts";

// A provider that is off, as Apple is on staging until Martin's steps
// (ADR 0034): its start and its callback answer with the "off" page and
// touch no database row.

/** A database that fails the test if anything uses it. */
const noDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error("The database was used.");
    },
  },
) as Database;

const apiOrigin = "http://api.test";
const now = new Date("2026-11-22T12:00:00.000Z");

function googleOnly() {
  return createProviderSignInService({
    db: noDatabase,
    hasher: createKeyedHasher("unit-test-secret-of-at-least-32-characters"),
    clock: () => now,
    logger: createLogger({ level: "silent" }),
    auth: {} as AuthService,
    providers: [createDevProvider({ name: "google", apiOrigin })],
    apiOrigin,
    returnUrls: { webOrigins: ["https://web.test"], appScheme: "puffinride", allowExpoGo: false },
    limiter: createMemoryRateLimiter({
      rules: [{ limit: 20, windowSeconds: 600 }],
      clock: () => now,
    }),
  });
}

describe("a provider that is off", () => {
  it("is not listed for the sign-in screen", () => {
    expect(googleOnly().names).toEqual(["google"]);
  });

  it("answers its start with the off page", async () => {
    expect(
      await googleOnly().start({
        provider: "apple",
        challenge: pkceChallenge("v".repeat(43)),
        returnUrl: "https://web.test/sign-in/return",
        clientKey: "a-client",
      }),
    ).toEqual({ kind: "page", status: 404, page: "off" });
  });

  it("answers a form posted to its callback with the off page, and keeps nothing", async () => {
    expect(
      await googleOnly().callback({
        provider: "apple",
        state: "sr_st_from-someone",
        code: "a-code",
        error: undefined,
        appleUser: { name: { firstName: "Someone" } },
      }),
    ).toEqual({ kind: "page", status: 404, page: "off" });
  });
});
