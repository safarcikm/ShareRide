import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseConnection } from "../index.ts";
import { legalDocuments } from "../schema/index.ts";
import { seedDraftLegalDocuments } from "../seed.ts";
import { freshTestDatabase } from "../testing.ts";
import { publishedDocuments, publishedVersions, publishLegalDocuments } from "./published.ts";

const deploy = new Date("2026-11-23T09:00:00Z");

describe("publishLegalDocuments (ADR 0043)", () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await freshTestDatabase();
  });

  afterAll(async () => {
    await connection.close();
  });

  it("publishes every version in both languages, from the deploy that first carries it", async () => {
    await seedDraftLegalDocuments(connection.db, new Date("2026-11-13T12:00:00Z"));
    expect(await publishLegalDocuments(connection.db, deploy)).toBe(publishedVersions.length);

    const rows = await connection.db.select().from(legalDocuments);
    expect(rows).toHaveLength(3 + publishedVersions.length);
    for (const document of publishedDocuments()) {
      const row = rows.find(
        (candidate) => candidate.type === document.type && candidate.version === document.version,
      );
      expect(row).toMatchObject({ material: document.material, publishedAt: deploy });
      expect(row?.texts).toEqual(document.texts);
    }
  });

  it("leaves what is published alone on the next deploy", async () => {
    const before = await connection.db.select().from(legalDocuments);
    expect(await publishLegalDocuments(connection.db, new Date("2026-11-24T09:00:00Z"))).toBe(0);
    expect(await connection.db.select().from(legalDocuments)).toEqual(before);
  });

  it("never overwrites a version the database already has, even with other text", async () => {
    const [first] = publishedDocuments();
    if (first === undefined) throw new Error("nothing is published");
    const where = and(
      eq(legalDocuments.type, first.type),
      eq(legalDocuments.version, first.version),
    );
    const other = { ...first.texts.en, body: "Something else." };
    await connection.db
      .update(legalDocuments)
      .set({ texts: { ...first.texts, en: other } })
      .where(where);
    await publishLegalDocuments(connection.db, new Date("2026-11-25T09:00:00Z"));
    const [row] = await connection.db.select().from(legalDocuments).where(where);
    expect(row?.texts.en.body).toBe("Something else.");
  });

  it("publishes a version that takes effect later with that date, so it is not current before", async () => {
    const [first] = publishedDocuments();
    if (first === undefined) throw new Error("nothing is published");
    const later = { ...first, version: 99, takesEffect: new Date("2026-12-24T00:00:00Z") };
    expect(await publishLegalDocuments(connection.db, deploy, [later])).toBe(1);
    const [row] = await connection.db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.type, first.type), eq(legalDocuments.version, 99)));
    expect(row?.publishedAt).toEqual(new Date("2026-12-24T00:00:00Z"));
  });
});
