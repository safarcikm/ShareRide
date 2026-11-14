import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, loadErrorReportingConfig } from "./config.ts";

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
        sender: "ShareRide",
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
    });
  });

  it("has defaults for local development", () => {
    const config = loadConfig(development);
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe("info");
    expect(config.sms).toEqual({ provider: "dev", paused: false });
    expect(config.webOrigins).toEqual([]);
    expect(config.trustedProxies).toBe(0);
    expect(config.webAppDir).toBeUndefined();
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
      sender: "ShareRide",
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
    expect(loadConfig({ ...valid, SMS_SENDER: "ShareRide2" }).sms).toMatchObject({
      sender: "ShareRide2",
    });
    for (const sender of ["Share Ride", "ShareRideApp1", "1ShareRide", "Deilibíll"]) {
      expect(() => loadConfig({ ...valid, SMS_SENDER: sender })).toThrow(ConfigError);
    }
  });

  it("pauses SMS sending with the kill switch", () => {
    expect(loadConfig({ ...valid, SMS_PAUSED: "true" }).sms.paused).toBe(true);
    expect(loadConfig({ ...development, SMS_PAUSED: "true" }).sms.paused).toBe(true);
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
