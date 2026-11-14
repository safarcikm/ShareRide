import { sql, type SQL } from "drizzle-orm";
import { type AnyPgColumn, customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** UUID version 7 keys, made by PostgreSQL 18: unique and in time order. */
export const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

/** A point in time, stored in UTC (`timestamptz`). */
export const at = () => timestamp({ withTimezone: true, mode: "date" });

/** `created_at` and `updated_at`, which every table has (conventions). */
export const timestamps = {
  createdAt: at().notNull().defaultNow(),
  updatedAt: at()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** A check that a column holds one of the domain's values (fixed lists, never user input). */
export const oneOf = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} in (${sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql`, `,
  )})`;

/** A position in WGS 84, the system GPS and maps use. */
export interface Position {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Reads PostGIS's hex EWKB for a point, as PostgreSQL returns a geography
 * column: byte order, type (with flags), an optional SRID, then x and y.
 */
export function positionFromEwkb(hex: string): Position {
  const bytes = Buffer.from(hex, "hex");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = view.getUint8(0) === 1;
  const type = view.getUint32(1, littleEndian);
  const hasSrid = (type & 0x20000000) !== 0;
  if ((type & 0x0fffffff) !== 1) throw new Error("The value is not a point.");
  const offset = hasSrid ? 9 : 5;
  return {
    longitude: view.getFloat64(offset, littleEndian),
    latitude: view.getFloat64(offset + 8, littleEndian),
  };
}

/** `geography(Point, 4326)`: distances on it are in metres on the earth (ADR 0005). */
export const geographyPoint = customType<{ data: Position; driverData: string }>({
  dataType: () => "geography(Point, 4326)",
  toDriver: ({ longitude, latitude }) =>
    `SRID=4326;POINT(${String(longitude)} ${String(latitude)})`,
  fromDriver: positionFromEwkb,
});
