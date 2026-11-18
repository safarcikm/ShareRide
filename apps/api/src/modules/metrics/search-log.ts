import { schema, type Database } from "@shareride/db";
import {
  searchLogDeletedBefore,
  searchLogHour,
  type SearchEndKind,
  type SearchLogPlatform,
} from "@shareride/domain";
import { lt } from "drizzle-orm";
import type { Logger } from "../../logger.ts";

const { searchLog } = schema;

// The search log (spec 10, 3.4.5; R10.6): what was searched for, never by
// whom. Nothing here takes a person, a session, a device or an address, so
// none can reach a row.

export interface SearchLogEntry {
  readonly from: { readonly kind: SearchEndKind; readonly id: string };
  readonly to: { readonly kind: SearchEndKind; readonly id: string };
  /** "2026-11-14", or undefined for any day. */
  readonly date: string | undefined;
  readonly results: number;
  readonly platform: SearchLogPlatform;
}

export interface SearchLog {
  /**
   * Notes a search, after its answer is ready and apart from it: this
   * returns at once and never fails. A row that cannot be written is
   * logged and lost.
   */
  record(entry: SearchLogEntry): void;
  /** Resolves when every row noted so far is written or lost; for tests and shutdown. */
  idle(): Promise<void>;
}

export function createSearchLog(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly logger: Logger;
}): SearchLog {
  const { db, clock, logger } = dependencies;
  const pending = new Set<Promise<void>>();
  return {
    record(entry) {
      const write = (async () => {
        try {
          await db.insert(searchLog).values({
            fromKind: entry.from.kind,
            fromId: entry.from.id,
            toKind: entry.to.kind,
            toId: entry.to.id,
            searchedDate: entry.date ?? null,
            results: entry.results,
            platform: entry.platform,
            searchedHour: searchLogHour(clock()),
          });
        } catch (error) {
          logger.warn({ err: error }, "A search could not be logged.");
        }
      })();
      pending.add(write);
      void write.finally(() => pending.delete(write));
    },
    async idle() {
      await Promise.all(pending);
    },
  };
}

/** A log that keeps nothing, for an app built without one. */
export const noSearchLog: SearchLog = { record: () => undefined, idle: () => Promise.resolve() };

/** Deletes the rows older than 14 months; how many went. */
export async function cleanUpSearchLog(db: Database, now: Date): Promise<number> {
  const rows = await db
    .delete(searchLog)
    .where(lt(searchLog.searchedHour, searchLogDeletedBefore(now)))
    .returning({ id: searchLog.id });
  return rows.length;
}
