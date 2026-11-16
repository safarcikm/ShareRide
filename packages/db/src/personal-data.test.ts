import { deletionEffects, exportSections } from "@shareride/domain";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { personalData } from "./personal-data.ts";
import * as schema from "./schema/index.ts";

const tables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table));

type Config = (typeof tables)[number];
const sorted = (names: readonly string[]) => [...names].sort();

/** Columns with a foreign key to `users`. */
const keysToUsers = (config: Config) =>
  config.foreignKeys
    .map((key) => key.reference())
    .filter((reference) => getTableConfig(reference.foreignTable).name === "users")
    .flatMap((reference) => reference.columns.map((column) => column.name));

/** UUID columns other than the table's own ID that point nowhere: perhaps a person. */
const looseIds = (config: Config) => {
  const keyed = new Set(
    config.foreignKeys.flatMap((key) => key.reference().columns.map((column) => column.name)),
  );
  return config.columns
    .filter(
      (column) => column.columnType === "PgUUID" && !column.primary && !keyed.has(column.name),
    )
    .map((column) => column.name);
};

/** Columns that can hold text a person wrote or that tells about them. */
const textColumns = (config: Config) =>
  config.columns
    .filter((column) => ["PgText", "PgVarchar", "PgJsonb", "PgArray"].includes(column.columnType))
    .map((column) => column.name);

describe("the personal data catalogue (spec 11; privacy self-service plan, 4.2)", () => {
  it("lists every table, so a new table says what export and deletion do with it", () => {
    const missing = tables.map((config) => config.name).filter((name) => !(name in personalData));
    expect(missing).toEqual([]);
  });

  it("lists no table that does not exist", () => {
    const names = new Set(tables.map((config) => config.name));
    expect(Object.keys(personalData).filter((name) => !names.has(name))).toEqual([]);
  });

  it("names every column that holds a person's ID, with a foreign key or without", () => {
    for (const config of tables) {
      const entry = personalData[config.name];
      const people = entry?.personColumns ?? [];
      const loose = looseIds(config);
      const unclassified = loose.filter(
        (name) => !people.includes(name) && !(entry?.otherIds ?? []).includes(name),
      );
      const notIds = people.filter(
        (name) => !keysToUsers(config).includes(name) && !loose.includes(name),
      );
      expect({
        table: config.name,
        missing: keysToUsers(config).filter((name) => !people.includes(name)),
        unclassified,
        notIds,
      }).toEqual({ table: config.name, missing: [], unclassified: [], notIds: [] });
    }
  });

  it("says what deletion does to every table about a person, and nothing for the rest", () => {
    for (const config of tables) {
      const entry = personalData[config.name];
      expect({ table: config.name, about: entry?.category !== null }).toEqual({
        table: config.name,
        about: entry?.onDeletion !== null,
      });
      if (entry?.personColumns.length !== 0) {
        expect({ table: config.name, category: entry?.category ?? null }).not.toEqual({
          table: config.name,
          category: null,
        });
      }
    }
  });

  it("decides for every text column of a kept row whether it is emptied or kept", () => {
    for (const config of tables) {
      const deletion = personalData[config.name]?.onDeletion;
      if (deletion?.rows !== "keep") continue;
      expect({
        table: config.name,
        columns: sorted([...deletion.kept, ...deletion.emptied]),
      }).toEqual({ table: config.name, columns: sorted(textColumns(config)) });
    }
  });

  it("uses only known kinds of data and export sections, and says why a table is left out", () => {
    for (const [table, entry] of Object.entries(personalData)) {
      if (entry.category !== null) expect(deletionEffects).toHaveProperty(entry.category);
      if ("section" in entry.export) expect(exportSections).toContain(entry.export.section);
      else
        expect({ table, reason: entry.export.leftOut.length > 10 }).toEqual({
          table,
          reason: true,
        });
    }
  });
});
