import { codePurposes, notificationKinds, outboxEventTypes } from "@shareride/domain";
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

  it("allow a console recovery's code, event, notice and session end (spec 22)", async () => {
    const result = await connection.pool.query<{ name: string; definition: string }>(
      "SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = ANY($1)",
      [
        [
          "verification_codes_purpose_check",
          "outbox_events_kind_check",
          "notifications_kind_check",
          "scheduled_notifications_kind_check",
          "operator_sessions_end_reason_check",
        ],
      ],
    );
    const definition = (name: string) =>
      result.rows.find((row) => row.name === name)?.definition ?? "";
    for (const purpose of codePurposes) {
      expect(definition("verification_codes_purpose_check")).toContain(`'${purpose}'`);
    }
    for (const type of outboxEventTypes) {
      expect(definition("outbox_events_kind_check")).toContain(`'${type}'`);
    }
    for (const kind of notificationKinds) {
      expect(definition("notifications_kind_check")).toContain(`'${kind}'`);
      expect(definition("scheduled_notifications_kind_check")).toContain(`'${kind}'`);
    }
    expect(definition("operator_sessions_end_reason_check")).toContain("'recovered'");
  });

  it("answer a ping", async () => {
    await expect(pingDatabase(connection.pool)).resolves.toBeUndefined();
  });
});
