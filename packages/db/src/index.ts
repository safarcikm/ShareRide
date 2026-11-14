import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema/index.ts";

export { schema };
export { withoutQueryValues } from "./safe-error.ts";
export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  readonly db: Database;
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

export interface ConnectOptions {
  /** Most connections the API keeps open. */
  readonly maxConnections?: number;
  /** Shown in pg_stat_activity, to tell the API from the migrator. */
  readonly applicationName?: string;
}

export function connectDatabase(url: string, options: ConnectOptions = {}): DatabaseConnection {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? "shareride",
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Applies every migration that has not run yet. Safe to run repeatedly. */
export async function migrateDatabase(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}

/** Resolves when the database answers a trivial query within the timeout. */
export async function pingDatabase(pool: pg.Pool, timeoutMs = 2_000): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${String(Math.trunc(timeoutMs))}`);
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
