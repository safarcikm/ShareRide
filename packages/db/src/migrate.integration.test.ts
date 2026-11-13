import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connectDatabase,
  migrateDatabase,
  pingDatabase,
  type DatabaseConnection,
} from "./index.ts";
import { emptyTestDatabase, testDatabaseUrl } from "./testing.ts";

describe("migrations", () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = connectDatabase(testDatabaseUrl(), { applicationName: "shareride-test" });
    await emptyTestDatabase(connection);
  });

  afterAll(async () => {
    await connection.close();
  });

  it("apply to an empty database, and again without error", async () => {
    await migrateDatabase(connection.db);
    await migrateDatabase(connection.db);
  });

  it("enable PostGIS, unaccent and pg_trgm", async () => {
    const result = await connection.pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension ORDER BY extname",
    );
    expect(result.rows.map((row) => row.extname)).toEqual(
      expect.arrayContaining(["pg_trgm", "postgis", "unaccent"]),
    );
  });

  it("answer a ping", async () => {
    await expect(pingDatabase(connection.pool)).resolves.toBeUndefined();
  });
});
