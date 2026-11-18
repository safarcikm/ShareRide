import { Writable } from "node:stream";
import { pingDatabase, type DatabaseConnection } from "@shareride/db";
import { freshTestDatabase } from "@shareride/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";

describe("GET /v1/health/ready with a real database", () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await freshTestDatabase();
  });

  afterAll(async () => {
    await connection.close();
  });

  function app(check: () => Promise<void>) {
    const silent = new Writable({
      write: (_chunk, _encoding, callback) => {
        callback();
      },
    });
    return createApp({
      logger: createLogger({ level: "info", destination: silent }),
      checkDatabase: check,
    });
  }

  it("is ready when PostgreSQL answers", async () => {
    const response = await app(() => pingDatabase(connection.pool)).request("/v1/health/ready");
    expect(response.status).toBe(200);
  });

  it("leaves the pool's connections without its short timeout", async () => {
    await pingDatabase(connection.pool);
    // The pool hands out the connection the ping gave back.
    const { rows } = await connection.pool.query<{ statement_timeout: string }>(
      "SHOW statement_timeout",
    );
    expect(rows[0]?.statement_timeout).toBe("0");
  });

  it("is unavailable when the pool is closed", async () => {
    const closed = await freshTestDatabase();
    await closed.close();
    const response = await app(() => pingDatabase(closed.pool)).request("/v1/health/ready");
    expect(response.status).toBe(503);
  });
});
