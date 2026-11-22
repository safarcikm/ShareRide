import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadAdminOrigin, loadConfig, loadErrorReportingConfig } from "./config.ts";

const valid = {
  NODE_ENV: "production",
  PORT: "8080",
  LOG_LEVEL: "warn",
  DATABASE_URL: "postgres://app:secret-password@db.internal:5432/shareride",
  AUTH_SECRET: "a-long-random-secret-of-at-least-32-characters",
  SMS_PROVIDER: "46elks",
  ELKS_API_USERNAME: "u-example",
  ELKS_API_PASSWORD: "p-example",
  WEB_ORIGINS: "https://shareride.is, https://www.shareride.is",
  TRUST_PROXY: "2",
  APP_ENV: "production",
  SENTRY_DSN: "https://public@o1.ingest.de.sentry.io/2",
  RENDER_GIT_COMMIT: "0123abc",
  WEB_APP_DIR: "/repo/web",
};

/** A made-up Apple team key: a P-256 key as PKCS #8 PEM, as Apple's .p8 file is. */
const pem = { type: "pkcs8", format: "pem" } as const;
const appleKey = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: pem,
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;

const development = {
  NODE_ENV: "development",
  DATABASE_URL: valid.DATABASE_URL,
  AUTH_SECRET: valid.AUTH_SECRET,
};

describe("loadConfig", () => {
  it("reads a complete environment", () => {
    expect(loadConfig({ ...valid, NODE_ENV: "test" })).toEqual({
      nodeEnv: "test",
      port: 8080,
      logLevel: "warn",
      databaseUrl: valid.DATABASE_URL,
      authSecret: valid.AUTH_SECRET,
      sms: {
        provider: "46elks",
        username: "u-example",
        password: "p-example",
        sender: "PuffinRide",
        paused: false,
      },
      webOrigins: ["https://shareride.is", "https://www.shareride.is"],
      trustedProxies: 2,
      errorReporting: {
        dsn: "https://public@o1.ingest.de.sentry.io/2",
        environment: "production",
        release: "0123abc",
      },
      webAppDir: "/repo/web",
      payments: { provider: "none" },
      worker: true,
      push: { accessToken: undefined },
      email: { provider: "dev", webAppUrl: "http://localhost:8081" },
      adminOrigin: "http://localhost:8080",
      photos: { provider: "folder", folder: join(tmpdir(), "shareride-photos") },
      signIn: {
        google: { mode: "dev" },
        apple: { mode: "dev" },
        apiOrigin: "http://localhost:8080",
        returnOrigins: [
          "https://shareride.is",
          "https://www.shareride.is",
          "http://localhost:8081",
        ],
        allowExpoGo: true,
      },
    });
  });

  it("uses the stand-in for Google locally, and nothing on a server until told (ADR 0034)", () => {
    expect(loadConfig(development).signIn).toEqual({
      google: { mode: "dev" },
      apple: { mode: "dev" },
      apiOrigin: "http://localhost:3000",
      returnOrigins: ["http://localhost:8081"],
      allowExpoGo: true,
    });
    expect(loadConfig(valid).signIn).toEqual({
      google: { mode: "off" },
      apple: { mode: "off" },
      apiOrigin: "http://localhost:8080",
      returnOrigins: ["https://shareride.is", "https://www.shareride.is"],
      allowExpoGo: false,
    });
  });

  it("refuses the stand-in in production, staging included", () => {
    expect(() => loadConfig({ ...valid, GOOGLE_SIGN_IN: "dev" })).toThrow("GOOGLE_SIGN_IN");
    expect(() => loadConfig({ ...valid, APPLE_SIGN_IN: "dev" })).toThrow("APPLE_SIGN_IN");
  });

  it("signs in with Apple with its Services ID and the team's key, \\n allowed for line breaks", () => {
    const apple = {
      APPLE_SIGN_IN: "apple",
      APPLE_SERVICES_ID: "is.puffinride.preview.web",
      APPLE_TEAM_ID: "TEAM123456",
      APPLE_KEY_ID: "KEY1234567",
      APPLE_PRIVATE_KEY: appleKey.trim().replaceAll("\n", "\\n"),
      API_ORIGIN: "https://staging.skinnar.is",
    };
    expect(loadConfig({ ...valid, ...apple }).signIn.apple).toEqual({
      mode: "apple",
      servicesId: "is.puffinride.preview.web",
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: appleKey.trim(),
    });
    expect(
      loadConfig({ ...valid, ...apple, APPLE_PRIVATE_KEY: appleKey }).signIn.apple,
    ).toMatchObject({
      privateKey: appleKey,
    });
    for (const key of [
      "APPLE_SERVICES_ID",
      "APPLE_TEAM_ID",
      "APPLE_KEY_ID",
      "APPLE_PRIVATE_KEY",
      "API_ORIGIN",
    ] as const) {
      expect(() => loadConfig({ ...valid, ...apple, [key]: undefined })).toThrow(key);
    }
    const rsa = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: pem,
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    for (const wrong of [rsa, "not a key"]) {
      expect(() => loadConfig({ ...valid, ...apple, APPLE_PRIVATE_KEY: wrong })).toThrow(
        "APPLE_PRIVATE_KEY",
      );
    }
    // The error names the setting, never the key.
    expect(() => loadConfig({ ...valid, ...apple, APPLE_PRIVATE_KEY: rsa })).not.toThrow("BEGIN");
    expect(() =>
      loadConfig({ ...valid, ...apple, API_ORIGIN: "http://staging.skinnar.is" }),
    ).toThrow("API_ORIGIN");
    expect(() => loadConfig({ ...valid, ...apple, APPLE_TEAM_ID: "team" })).toThrow(
      "APPLE_TEAM_ID",
    );
    expect(loadConfig({ ...development, ...apple }).signIn.allowExpoGo).toBe(false);
  });

  it("signs in with Google with its web client, on the API's public origin", () => {
    const google = {
      GOOGLE_SIGN_IN: "google",
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "a-secret",
      API_ORIGIN: "https://staging.skinnar.is",
      WEB_ORIGINS: "",
      WEB_APP_URL: "https://staging.skinnar.is",
    };
    expect(loadConfig({ ...valid, ...google }).signIn).toEqual({
      google: {
        mode: "google",
        clientId: "client.apps.googleusercontent.com",
        clientSecret: "a-secret",
      },
      apple: { mode: "off" },
      apiOrigin: "https://staging.skinnar.is",
      returnOrigins: ["https://staging.skinnar.is"],
      allowExpoGo: false,
    });
    for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "API_ORIGIN"] as const) {
      expect(() => loadConfig({ ...valid, ...google, [key]: undefined })).toThrow(key);
    }
    expect(() => loadConfig({ ...valid, ...google, API_ORIGIN: "https://x.is/api" })).toThrow(
      "API_ORIGIN",
    );
    expect(() =>
      loadConfig({ ...valid, ...google, API_ORIGIN: "http://staging.skinnar.is" }),
    ).toThrow("API_ORIGIN");
  });

  it("takes Expo Go's return addresses only while Google is the stand-in", () => {
    const google = {
      GOOGLE_SIGN_IN: "google",
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "a-secret",
    };
    expect(loadConfig({ ...development, ...google }).signIn.allowExpoGo).toBe(false);
    expect(loadConfig({ ...development, GOOGLE_SIGN_IN: "off" }).signIn.allowExpoGo).toBe(true);
  });

  it("takes an empty value as unset, as Render's empty secret entries are", () => {
    expect(
      loadConfig({
        ...valid,
        GOOGLE_SIGN_IN: "",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        APPLE_SIGN_IN: "",
        APPLE_SERVICES_ID: "",
        APPLE_TEAM_ID: "",
        APPLE_KEY_ID: "",
        APPLE_PRIVATE_KEY: "",
        API_ORIGIN: "",
      }).signIn,
    ).toMatchObject({ google: { mode: "off" }, apple: { mode: "off" } });
  });

  it("keeps photos in a folder locally, and takes none on a server until a bucket is set (ADR 0022)", () => {
    expect(loadConfig(development).photos).toEqual({
      provider: "folder",
      folder: join(tmpdir(), "shareride-photos"),
    });
    expect(loadConfig({ ...development, PHOTO_FOLDER: "/data/photos" }).photos).toEqual({
      provider: "folder",
      folder: "/data/photos",
    });
    expect(loadConfig(valid).photos).toEqual({ provider: "none" });
    expect(loadConfig({ ...valid, APP_ENV: "staging" }).photos).toEqual({ provider: "none" });
  });

  it("refuses the folder in production, where a deploy would lose the photos", () => {
    expect(() => loadConfig({ ...valid, PHOTO_STORAGE: "folder" })).toThrow(
      "PHOTO_STORAGE: a folder loses its photos on each deploy and is not allowed in production",
    );
  });

  it("stores photos in the Hetzner bucket with its endpoint, name and keys", () => {
    const bucket = {
      PHOTO_STORAGE: "hetzner",
      PHOTO_BUCKET_ENDPOINT: "https://hel1.your-objectstorage.com",
      PHOTO_BUCKET: "shareride-photos",
      PHOTO_BUCKET_ACCESS_KEY: "access-example",
      PHOTO_BUCKET_SECRET_KEY: "secret-example",
    };
    expect(loadConfig({ ...valid, ...bucket }).photos).toEqual({
      provider: "hetzner",
      endpoint: "https://hel1.your-objectstorage.com",
      bucket: "shareride-photos",
      accessKey: "access-example",
      secretKey: "secret-example",
    });
    try {
      loadConfig({ ...valid, PHOTO_STORAGE: "hetzner" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).problems).toEqual([
        "PHOTO_BUCKET_ENDPOINT: needed when PHOTO_STORAGE is hetzner",
        "PHOTO_BUCKET: needed when PHOTO_STORAGE is hetzner",
        "PHOTO_BUCKET_ACCESS_KEY: needed when PHOTO_STORAGE is hetzner",
        "PHOTO_BUCKET_SECRET_KEY: needed when PHOTO_STORAGE is hetzner",
      ]);
    }
    expect(() =>
      loadConfig({
        ...valid,
        ...bucket,
        PHOTO_BUCKET_ENDPOINT: "http://hel1.your-objectstorage.com",
      }),
    ).toThrow("PHOTO_BUCKET_ENDPOINT");
    // A dot breaks the bucket's HTTPS address, which is a host name under the endpoint's.
    for (const name of ["Shareride_Photos", "shareride.photos"]) {
      expect(() => loadConfig({ ...valid, ...bucket, PHOTO_BUCKET: name })).toThrow("PHOTO_BUCKET");
    }
  });

  it("binds the console's passkeys to ADMIN_ORIGIN, or the API itself locally (ADR 0028)", () => {
    expect(loadConfig(development).adminOrigin).toBe("http://localhost:3000");
    expect(loadConfig(valid).adminOrigin).toBeUndefined();
    expect(
      loadConfig({ ...valid, ADMIN_ORIGIN: "https://shareride-staging-api.onrender.com" })
        .adminOrigin,
    ).toBe("https://shareride-staging-api.onrender.com");
    expect(() => loadConfig({ ...valid, ADMIN_ORIGIN: "https://shareride.is/admin" })).toThrow(
      ConfigError,
    );
  });

  it("takes a console password of 12 characters or more on staging, and none by default (ADR 0041)", () => {
    const staging = { ...valid, APP_ENV: "staging" };
    expect(loadConfig(staging).adminPassword).toBeUndefined();
    expect(loadConfig({ ...staging, ADMIN_PASSWORD: "twelve chars" }).adminPassword).toBe(
      "twelve chars",
    );
    // Cleared instead of deleted in Render: off, not a failed start.
    expect(loadConfig({ ...staging, ADMIN_PASSWORD: "" }).adminPassword).toBeUndefined();
    expect(() => loadConfig({ ...staging, ADMIN_PASSWORD: "short" })).toThrow("ADMIN_PASSWORD");
    expect(() => loadConfig({ ...valid, ADMIN_PASSWORD: "twelve chars" })).toThrow(
      "ADMIN_PASSWORD: password sign-in is not allowed in production",
    );
  });

  it("gives the operator command the same console origin as the API", () => {
    expect(loadAdminOrigin({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(loadAdminOrigin({ NODE_ENV: "production" })).toBeUndefined();
    expect(
      loadAdminOrigin({ NODE_ENV: "production", ADMIN_ORIGIN: "https://admin.shareride.is" }),
    ).toBe("https://admin.shareride.is");
    expect(() =>
      loadAdminOrigin({ NODE_ENV: "production", ADMIN_ORIGIN: "https://shareride.is/admin" }),
    ).toThrow(ConfigError);
  });

  it("has defaults for local development", () => {
    const config = loadConfig(development);
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe("info");
    expect(config.sms).toEqual({ provider: "dev", paused: false });
    expect(config.webOrigins).toEqual([]);
    expect(config.trustedProxies).toBe(0);
    expect(config.webAppDir).toBeUndefined();
    expect(config.payments).toEqual({ provider: "test" });
  });

  it("reads TRUST_PROXY as the number of proxies in front", () => {
    const trusted = (value: string) => loadConfig({ ...development, TRUST_PROXY: value });
    expect(trusted("false").trustedProxies).toBe(0);
    expect(trusted("true").trustedProxies).toBe(1);
    expect(trusted("2").trustedProxies).toBe(2);
    for (const value of ["-1", "6", "yes", "1.5"]) {
      expect(() => trusted(value)).toThrow(ConfigError);
    }
  });

  it("refuses a short AUTH_SECRET", () => {
    expect(() => loadConfig({ ...development, AUTH_SECRET: "too-short" })).toThrow(ConfigError);
  });

  it("refuses a web origin that is not an http or https origin", () => {
    expect(() => loadConfig({ ...development, WEB_ORIGINS: "javascript:alert(1)" })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ ...development, WEB_ORIGINS: "https://shareride.is/path" })).toThrow(
      ConfigError,
    );
  });

  it("refuses the example AUTH_SECRET in production", () => {
    try {
      loadConfig({ ...valid, AUTH_SECRET: "local-only-secret-not-for-production-use" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).problems).toContain(
        "AUTH_SECRET: the example value is not allowed in production",
      );
    }
  });

  it("refuses the development SMS sender in production, since it prints codes", () => {
    try {
      loadConfig({ ...valid, SMS_PROVIDER: "dev" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).problems).toEqual([
        "SMS_PROVIDER: dev prints codes in the terminal and is not allowed in production",
      ]);
    }
  });

  it("needs the 46elks keys when 46elks sends the SMS", () => {
    try {
      loadConfig({ ...development, SMS_PROVIDER: "46elks" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).problems).toEqual([
        "ELKS_API_USERNAME: needed when SMS_PROVIDER is 46elks",
        "ELKS_API_PASSWORD: needed when SMS_PROVIDER is 46elks",
      ]);
    }
  });

  it("sends through Vonage with its key and secret", () => {
    const vonage = {
      ...development,
      SMS_PROVIDER: "vonage",
      VONAGE_API_KEY: "k-example",
      VONAGE_API_SECRET: "s-example",
    };
    expect(loadConfig(vonage).sms).toEqual({
      provider: "vonage",
      apiKey: "k-example",
      apiSecret: "s-example",
      sender: "PuffinRide",
      paused: false,
    });
  });

  it("refuses an empty Vonage key", () => {
    expect(() =>
      loadConfig({
        ...valid,
        SMS_PROVIDER: "vonage",
        VONAGE_API_KEY: "",
        VONAGE_API_SECRET: "s-example",
      }),
    ).toThrow(ConfigError);
  });

  it("needs the Vonage key and secret when Vonage sends the SMS", () => {
    try {
      loadConfig({ ...development, SMS_PROVIDER: "vonage" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).problems).toEqual([
        "VONAGE_API_KEY: needed when SMS_PROVIDER is vonage",
        "VONAGE_API_SECRET: needed when SMS_PROVIDER is vonage",
      ]);
    }
  });

  it("takes a sender name of up to 11 letters and digits, starting with a letter", () => {
    expect(loadConfig({ ...valid, SMS_SENDER: "PuffinRide2" }).sms).toMatchObject({
      sender: "PuffinRide2",
    });
    for (const sender of ["Share Ride", "PuffinRideApp1", "1PuffinRide", "Deilibíll"]) {
      expect(() => loadConfig({ ...valid, SMS_SENDER: sender })).toThrow(ConfigError);
    }
  });

  it("pauses SMS sending with the kill switch", () => {
    expect(loadConfig({ ...valid, SMS_PAUSED: "true" }).sms.paused).toBe(true);
    expect(loadConfig({ ...development, SMS_PAUSED: "true" }).sms.paused).toBe(true);
  });

  it("pays with the test provider on local and staging, and never in production (milestone 4)", () => {
    expect(loadConfig({ ...valid, APP_ENV: "staging" }).payments).toEqual({ provider: "test" });
    expect(loadConfig({ ...valid, APP_ENV: "staging", PAYMENT_PROVIDER: "none" }).payments).toEqual(
      { provider: "none" },
    );
    expect(loadConfig(valid).payments).toEqual({ provider: "none" });
    expect(() => loadConfig({ ...valid, PAYMENT_PROVIDER: "test" })).toThrow(
      "PAYMENT_PROVIDER: the test provider moves no money and is not allowed in production",
    );
    // Without APP_ENV, NODE_ENV=production is production, as for the seed guard.
    const unnamed = { ...valid, APP_ENV: undefined };
    expect(loadConfig(unnamed).payments).toEqual({ provider: "none" });
    expect(() => loadConfig({ ...unnamed, PAYMENT_PROVIDER: "test" })).toThrow(ConfigError);
    expect(loadConfig({ ...development, APP_ENV: undefined }).payments).toEqual({
      provider: "test",
    });
  });

  it("runs the notification worker unless WORKER is off (plan, decision 2)", () => {
    expect(loadConfig(development).worker).toBe(true);
    expect(loadConfig({ ...development, WORKER: "on" }).worker).toBe(true);
    expect(loadConfig({ ...development, WORKER: "off" }).worker).toBe(false);
    expect(() => loadConfig({ ...development, WORKER: "no" })).toThrow("WORKER: invalid");
  });

  it("sends push with Expo's access token when it is set (plan 4.5)", () => {
    expect(loadConfig(development).push).toEqual({ accessToken: undefined });
    expect(loadConfig({ ...development, EXPO_ACCESS_TOKEN: "expo-test" }).push).toEqual({
      accessToken: "expo-test",
    });
    expect(() => loadConfig({ ...development, EXPO_ACCESS_TOKEN: "" })).toThrow(
      "EXPO_ACCESS_TOKEN",
    );
  });

  it("prints emails in the terminal locally, and sends none in production unless told (ADR 0027)", () => {
    expect(loadConfig(development).email).toEqual({
      provider: "dev",
      webAppUrl: "http://localhost:8081",
    });
    expect(loadConfig({ ...development, WEB_APP_URL: "http://localhost:8082" }).email).toEqual({
      provider: "dev",
      webAppUrl: "http://localhost:8082",
    });
    expect(loadConfig({ ...development, EMAIL_PROVIDER: "none" }).email).toEqual({
      provider: "none",
    });
    // Staging runs as production: no email until there is a domain.
    expect(loadConfig({ ...valid, APP_ENV: "staging" }).email).toEqual({ provider: "none" });
  });

  it("refuses the development outbox in production, since it prints addresses", () => {
    expect(() => loadConfig({ ...valid, EMAIL_PROVIDER: "dev" })).toThrow(
      "EMAIL_PROVIDER: dev prints emails in the terminal and is not allowed in production",
    );
  });

  it("sends through Mailjet with its keys, a sender on our domain and the web app's address", () => {
    const mailjet = {
      EMAIL_PROVIDER: "mailjet",
      MAILJET_API_KEY: "mj-public",
      MAILJET_SECRET_KEY: "mj-secret",
      EMAIL_FROM: "hello@shareride.is",
      WEB_APP_URL: "https://shareride.is",
    };
    expect(loadConfig({ ...valid, ...mailjet }).email).toEqual({
      provider: "mailjet",
      apiKey: "mj-public",
      secretKey: "mj-secret",
      from: { email: "hello@shareride.is", name: "PuffinRide" },
      webAppUrl: "https://shareride.is",
    });
    expect(
      loadConfig({ ...valid, ...mailjet, EMAIL_FROM_NAME: "PuffinRide beta" }).email,
    ).toMatchObject({
      from: { email: "hello@shareride.is", name: "PuffinRide beta" },
    });
    expect(() => loadConfig({ ...valid, EMAIL_PROVIDER: "mailjet" })).toThrow(ConfigError);
    try {
      loadConfig({ ...valid, EMAIL_PROVIDER: "mailjet" });
    } catch (error) {
      expect((error as ConfigError).problems).toEqual([
        "MAILJET_API_KEY: needed when EMAIL_PROVIDER is mailjet",
        "MAILJET_SECRET_KEY: needed when EMAIL_PROVIDER is mailjet",
        "EMAIL_FROM: needed when EMAIL_PROVIDER is mailjet",
        "WEB_APP_URL: needed when EMAIL_PROVIDER is mailjet",
      ]);
    }
    expect(() => loadConfig({ ...valid, ...mailjet, EMAIL_FROM: "PuffinRide" })).toThrow(
      "EMAIL_FROM: invalid",
    );
    expect(() =>
      loadConfig({ ...valid, ...mailjet, WEB_APP_URL: "https://shareride.is/app" }),
    ).toThrow("WEB_APP_URL");
  });

  it("names every missing or invalid variable", () => {
    expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(ConfigError);
    try {
      loadConfig({ PORT: "not-a-number" });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const { problems } = error as ConfigError;
      expect(problems.map((problem) => problem.split(":")[0])).toEqual(
        expect.arrayContaining(["NODE_ENV", "PORT", "DATABASE_URL", "AUTH_SECRET"]),
      );
    }
  });

  it("rejects a database URL that is not PostgreSQL", () => {
    expect(() => loadConfig({ ...development, DATABASE_URL: "mysql://app@db/shareride" })).toThrow(
      ConfigError,
    );
  });

  it("never repeats a submitted value in its messages, since URLs hold passwords", () => {
    try {
      loadConfig({
        ...development,
        DATABASE_URL: "secret-password-not-a-url",
        AUTH_SECRET: "secret-short",
      });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).message).not.toContain("secret-password");
      expect((error as ConfigError).message).not.toContain("secret-short");
    }
  });
});

describe("loadErrorReportingConfig", () => {
  it("sends nothing by default, and calls the environment local", () => {
    expect(loadErrorReportingConfig({})).toEqual({
      dsn: undefined,
      environment: "local",
      release: undefined,
    });
  });

  it("names the release by the commit Render built, unless SENTRY_RELEASE says otherwise", () => {
    const env = {
      SENTRY_DSN: "https://public@o1.ingest.de.sentry.io/2",
      APP_ENV: "staging",
      RENDER_GIT_COMMIT: "0123abc",
    };
    expect(loadErrorReportingConfig(env)).toEqual({
      dsn: env.SENTRY_DSN,
      environment: "staging",
      release: "0123abc",
    });
    expect(loadErrorReportingConfig({ ...env, SENTRY_RELEASE: "v1" }).release).toBe("v1");
  });

  it("refuses a DSN that is not an https URL, and an unknown APP_ENV", () => {
    expect(() => loadErrorReportingConfig({ SENTRY_DSN: "http://x@example.com/1" })).toThrow(
      ConfigError,
    );
    expect(() => loadErrorReportingConfig({ APP_ENV: "prod" })).toThrow(ConfigError);
  });

  it("refuses a DSN outside Sentry's EU region (ADR 0020)", () => {
    for (const host of ["o1.ingest.us.sentry.io", "o1.ingest.sentry.io", "sentry.example.com"]) {
      expect(() => loadErrorReportingConfig({ SENTRY_DSN: `https://public@${host}/1` })).toThrow(
        ConfigError,
      );
    }
  });

  it("refuses to turn on tracing, which would send more than errors", () => {
    expect(() => loadErrorReportingConfig({ SENTRY_TRACES_SAMPLE_RATE: "0.1" })).toThrow(
      "SENTRY_TRACES_SAMPLE_RATE: not used, error reports only (ADR 0020)",
    );
  });
});
