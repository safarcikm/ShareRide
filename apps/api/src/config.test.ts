import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

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
  TRUST_PROXY: "true",
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
      trustProxy: true,
    });
  });

  it("has defaults for local development", () => {
    const config = loadConfig(development);
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe("info");
    expect(config.sms).toEqual({ provider: "dev", paused: false });
    expect(config.webOrigins).toEqual([]);
    expect(config.trustProxy).toBe(false);
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
