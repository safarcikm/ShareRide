// Helpers for integration tests. Never import this from application code.
import { connectDatabase, migrateDatabase, type DatabaseConnection } from "./index.ts";

export function testDatabaseUrl(): string {
  const url = process.env["TEST_DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start infra/docker/compose.yml and copy .env.example to .env.",
    );
  }
  if (!new URL(url).pathname.endsWith("_test")) {
    // Resetting wipes the database, so refuse anything not named *_test.
    throw new Error("TEST_DATABASE_URL must point to a database whose name ends in _test.");
  }
  return url;
}

/** Drops everything in the test database, leaving it empty. */
export async function emptyTestDatabase(connection: DatabaseConnection): Promise<void> {
  await connection.pool.query(
    "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
}

/** An empty, fully migrated test database. */
export async function freshTestDatabase(): Promise<DatabaseConnection> {
  const connection = connectDatabase(testDatabaseUrl(), { applicationName: "shareride-test" });
  await emptyTestDatabase(connection);
  await migrateDatabase(connection.db);
  return connection;
}
