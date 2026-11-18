import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseConnection } from "./index.ts";
import { eq } from "drizzle-orm";
import { inviteCodes, legalDocuments } from "./schema/index.ts";
import {
  developmentInviteCode,
  seedDevelopmentData,
  seedDevelopmentInviteCode,
  seedDraftLegalDocuments,
} from "./seed.ts";
import { freshTestDatabase } from "./testing.ts";

describe("seedDraftLegalDocuments", () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await freshTestDatabase();
  });

  afterAll(async () => {
    await connection.close();
  });

  it("adds version 1 of each legal document, marked as a draft in both languages", async () => {
    await seedDraftLegalDocuments(connection.db, new Date("2026-11-13T12:00:00Z"));
    const rows = await connection.db.select().from(legalDocuments);
    expect(rows.map((row) => [row.type, row.version, row.material]).sort()).toEqual([
      ["community-rules", 1, true],
      ["privacy", 1, true],
      ["terms", 1, true],
    ]);
    for (const row of rows) {
      expect(row.texts.en.body).toMatch(/draft/i);
      expect(row.texts.is.body).toMatch(/drög/i);
    }
  });

  it("does nothing the second time", async () => {
    await seedDraftLegalDocuments(connection.db, new Date("2026-11-14T12:00:00Z"));
    const rows = await connection.db.select().from(legalDocuments);
    expect(rows).toHaveLength(3);
  });

  it("makes no invite code with what staging seeds on every deploy", async () => {
    await seedDevelopmentData(connection.db, new Date("2026-11-14T12:00:00Z"));
    expect(await connection.db.select().from(inviteCodes)).toHaveLength(0);
  });

  it("makes the local invite code once, and never brings an ended one back", async () => {
    const now = new Date("2026-11-14T12:00:00Z");
    await seedDevelopmentInviteCode(connection.db, now);
    await connection.db.update(inviteCodes).set({ endedAt: now });
    await seedDevelopmentInviteCode(connection.db, new Date("2026-11-15T12:00:00Z"));
    const rows = await connection.db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, developmentInviteCode));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ endedAt: now, usesAllowed: 500, createdBy: null });
  });
});
