import { personalData, schema } from "@shareride/db";
import { getTableColumns, getTableName, is, sql, type SQL } from "drizzle-orm";
import { PgTable, type PgColumn } from "drizzle-orm/pg-core";

// The personal data catalogue (packages/db/src/personal-data.ts) as the
// erasure and the clean-up use it: the tables it names, their columns, and
// what an emptied column holds.

const tables = new Map(
  (Object.values(schema) as unknown[])
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => [getTableName(table), table]),
);

export function tableOf(name: string): PgTable {
  const table = tables.get(name);
  if (table === undefined) throw new Error(`The catalogue names ${name}, which does not exist.`);
  return table;
}

/** The catalogue's tables that erasure changes, with a way to their columns. */
export function catalogued() {
  return Object.entries(personalData).flatMap(([name, entry]) => {
    const deletion = entry.onDeletion;
    if (deletion === null || deletion.rows === "leave") return [];
    const columns = getTableColumns(tableOf(name)) as Record<string, PgColumn>;
    const column = (key: string) => {
      const found = columns[key];
      if (found === undefined) throw new Error(`Erasure needs ${name}.${key}.`);
      return found;
    };
    return [{ name, entry, deletion, column }];
  });
}

/**
 * New values for a table's other IDs, such as a retry key, for rows moved
 * to the former member: two people's keys, unique per person, never collide
 * once both rows are the former member's.
 */
export function freshIdsOf(otherIds: readonly string[] | undefined): Record<string, SQL> {
  return Object.fromEntries((otherIds ?? []).map((key) => [key, sql`gen_random_uuid()`]));
}

/** What emptied columns hold: nothing, or an empty text or list where they must hold one. */
export function emptiedOf(
  keys: readonly string[],
  column: (key: string) => PgColumn,
): Record<string, unknown> {
  return Object.fromEntries(
    keys.map((key): [string, unknown] => {
      const found = column(key);
      if (!found.notNull) return [key, null];
      if (found.columnType === "PgText") return [key, ""];
      if (found.columnType === "PgArray") return [key, []];
      throw new Error(`No empty value for ${found.name}.`);
    }),
  );
}
