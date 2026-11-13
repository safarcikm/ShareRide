import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

const valid = {
  NODE_ENV: "production",
  PORT: "8080",
  LOG_LEVEL: "warn",
  DATABASE_URL: "postgres://app:secret-password@db.internal:5432/shareride",
};

describe("loadConfig", () => {
  it("reads a complete environment", () => {
    expect(loadConfig(valid)).toEqual({
      nodeEnv: "production",
      port: 8080,
      logLevel: "warn",
      databaseUrl: valid.DATABASE_URL,
    });
  });

  it("uses port 3000 and log level info by default", () => {
    const config = loadConfig({ NODE_ENV: "development", DATABASE_URL: valid.DATABASE_URL });
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe("info");
  });

  it("names every missing or invalid variable", () => {
    expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(ConfigError);
    try {
      loadConfig({ PORT: "not-a-number" });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const { problems } = error as ConfigError;
      expect(problems.map((problem) => problem.split(":")[0])).toEqual(
        expect.arrayContaining(["NODE_ENV", "PORT", "DATABASE_URL"]),
      );
    }
  });

  it("rejects a database URL that is not PostgreSQL", () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: "mysql://app@db/shareride" })).toThrow(
      ConfigError,
    );
  });

  it("never repeats a submitted value in its messages, since URLs hold passwords", () => {
    try {
      loadConfig({ ...valid, DATABASE_URL: "secret-password-not-a-url" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).message).not.toContain("secret-password");
    }
  });
});
