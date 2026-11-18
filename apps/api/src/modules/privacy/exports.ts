import { schema, type Database } from "@shareride/db";
import {
  err,
  exportAllowed,
  exportExpiresAt,
  ok,
  privacyCutoffs,
  privacySettings,
  type ExportTooSoon,
  type Result,
} from "@shareride/domain";
import { and, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { hashToken, newToken, type FileCipher } from "../../platform/crypto.ts";
import { zip } from "../../platform/zip.ts";
import type { AuthService, ConfirmError } from "../auth/service.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { collectExport, collectExportFiles } from "./export-data.ts";
import { renderExportPage } from "./export-page.ts";

// "Download my data" (spec 11, 3.2; plan 4.4): asked for with a fresh code,
// built by a job inside the API, sealed with the server secret and kept 7
// days. It leaves only through a one-time link that works for 2 minutes.

const { dataExports } = schema;

/** The HKDF purpose of the export key; a new version makes earlier files unreadable. */
export const exportCipherPurpose = "shareride-data-export-v1";

/** Tries at building one export before it is given up and the person may ask again. */
export const exportBuildAttempts = 3;

/**
 * An export taken for building is not taken again for this long, so two
 * runs never build it at once, and a try that failed waits this long.
 */
export const exportBuildLeaseMinutes = 5;

/** Where the person's latest export stands, and when they can ask for another. */
export type ExportStatus =
  | { readonly state: "none" }
  | {
      readonly state: "preparing" | "failed";
      readonly askedAt: Date;
      readonly nextAllowedAt: Date | null;
    }
  | {
      readonly state: "ready" | "expired";
      readonly askedAt: Date;
      readonly readyAt: Date;
      readonly expiresAt: Date;
      /** The ZIP's size in bytes; null once expired. */
      readonly byteSize: number | null;
      readonly nextAllowedAt: Date | null;
    };

export type AskExportError = ConfirmError | ExportTooSoon;

export interface ExportLink {
  /** The API path to open, such as /v1/exports/sr_dx_…; it is the key, so it is never logged. */
  readonly path: string;
  readonly expiresAt: Date;
}

export interface ExportFile {
  readonly filename: string;
  readonly zip: Buffer;
}

/** What a link points at, without using it up. */
export interface ExportFileInfo {
  readonly filename: string;
  readonly byteSize: number;
}

export interface ExportService {
  /** Asks for an export after checking the 24-hour rule, then the code (R11.1, R11.2). */
  ask(userId: string, code: string): Promise<Result<ExportStatus, AskExportError>>;
  status(userId: string): Promise<ExportStatus>;
  /** A new one-time link to the ready export; it replaces any earlier link. */
  link(userId: string): Promise<Result<ExportLink, { readonly code: "export_not_ready" }>>;
  /**
   * The file a link points at, once; undefined when the link is unknown,
   * used or expired, or the file cannot be opened (then the export failed
   * and the person may ask again).
   */
  download(token: string): Promise<ExportFile | undefined>;
  /** For a HEAD request: what the link points at, leaving it unused. */
  peek(token: string): Promise<ExportFileInfo | undefined>;
}

export interface ExportServiceDependencies {
  readonly db: Database;
  readonly auth: AuthService;
  readonly cipher: FileCipher;
  readonly clock: () => Date;
  readonly logger: Logger;
}

export interface ExportBuilder {
  /** Builds the exports asked for, one at a time; the number built. */
  buildDue(): Promise<number>;
}

export interface ExportBuilderDependencies {
  readonly db: Database;
  readonly cipher: FileCipher;
  readonly clock: () => Date;
  readonly logger: Logger;
}

type ExportRow = typeof dataExports.$inferSelect;

/** An export without its file, which status answers never need to load. */
const summary = {
  id: dataExports.id,
  askedAt: dataExports.askedAt,
  readyAt: dataExports.readyAt,
  failedAt: dataExports.failedAt,
  expiresAt: dataExports.expiresAt,
  byteSize: dataExports.byteSize,
  hasFile: sql<boolean>`${dataExports.file} is not null`,
};
type ExportSummary = Omit<
  ExportRow,
  "file" | "userId" | "attempts" | "linkHash" | "linkExpiresAt" | "createdAt" | "updatedAt"
> & { readonly hasFile: boolean };

/** The 24-hour rule counts the exports asked for, except those that failed. */
function nextAllowedAt(askedAt: Date, now: Date): Date | null {
  const next = new Date(askedAt.getTime() + privacySettings.exportEveryHours * 3600 * 1000);
  return next > now ? next : null;
}

function statusOf(row: ExportSummary | undefined, now: Date): ExportStatus {
  if (row === undefined) return { state: "none" };
  if (row.failedAt !== null) return { state: "failed", askedAt: row.askedAt, nextAllowedAt: null };
  const next = nextAllowedAt(row.askedAt, now);
  if (row.readyAt === null || row.expiresAt === null) {
    return { state: "preparing", askedAt: row.askedAt, nextAllowedAt: next };
  }
  const expired = !row.hasFile || row.expiresAt <= now;
  return {
    state: expired ? "expired" : "ready",
    askedAt: row.askedAt,
    readyAt: row.readyAt,
    expiresAt: row.expiresAt,
    byteSize: expired ? null : row.byteSize,
    nextAllowedAt: next,
  };
}

/** The file's name, with the day it was made in Iceland. */
function filenameOf(readyAt: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Reykjavik",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(readyAt);
  return `shareride-data-${day}.zip`;
}

export function createExportService(dependencies: ExportServiceDependencies): ExportService {
  const { db, auth, cipher, clock, logger } = dependencies;

  async function latest(q: Pick<Database, "select">, userId: string) {
    const [row] = await q
      .select(summary)
      .from(dataExports)
      .where(eq(dataExports.userId, userId))
      .orderBy(desc(dataExports.askedAt))
      .limit(1);
    return row;
  }

  /** When the last export that counts for the 24-hour rule was asked for. */
  async function lastCounted(q: Pick<Database, "select">, userId: string) {
    const [row] = await q
      .select({ askedAt: dataExports.askedAt })
      .from(dataExports)
      .where(and(eq(dataExports.userId, userId), isNull(dataExports.failedAt)))
      .orderBy(desc(dataExports.askedAt))
      .limit(1);
    return row?.askedAt ?? null;
  }

  return {
    async ask(userId, code) {
      // Refusals that need no code come first, so they never use one up.
      const allowed = exportAllowed(await lastCounted(db, userId), clock());
      if (!allowed.ok) return err(allowed.error);

      return auth.withConfirmCode(userId, code, async (tx) => {
        const now = clock();
        // One request per person at a time, so two cannot both pass the rule.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 1))`);
        const again = exportAllowed(await lastCounted(tx, userId), now);
        if (!again.ok) return err(again.error);
        // Only the newest file can be downloaded, so an earlier one goes now.
        await tx
          .update(dataExports)
          .set({ file: null, byteSize: null, linkHash: null, linkExpiresAt: null, updatedAt: now })
          .where(and(eq(dataExports.userId, userId), isNotNull(dataExports.file)));
        const [row] = await tx
          .insert(dataExports)
          .values({ userId, askedAt: now, createdAt: now, updatedAt: now })
          .returning(summary);
        return ok(statusOf(row, now));
      });
    },

    async status(userId) {
      return statusOf(await latest(db, userId), clock());
    },

    async link(userId) {
      const now = clock();
      const row = await latest(db, userId);
      if (row === undefined || statusOf(row, now).state !== "ready") {
        return err({ code: "export_not_ready" });
      }
      const token = newToken("dataExport");
      const expiresAt = new Date(now.getTime() + privacySettings.exportLinkSeconds * 1000);
      await db
        .update(dataExports)
        .set({ linkHash: hashToken(token), linkExpiresAt: expiresAt, updatedAt: now })
        .where(eq(dataExports.id, row.id));
      return ok({ path: `/v1/exports/${token}`, expiresAt });
    },

    async download(token) {
      const now = clock();
      // Taking the link and reading the file is one statement, so a link works once.
      const [row] = await db
        .update(dataExports)
        .set({ linkHash: null, linkExpiresAt: null, updatedAt: now })
        .where(usableLink(token, now))
        .returning({ id: dataExports.id, file: dataExports.file, readyAt: dataExports.readyAt });
      if (row === undefined || row.file === null || row.readyAt === null) return undefined;
      try {
        return { filename: filenameOf(row.readyAt), zip: cipher.open(row.file, row.id) };
      } catch (error) {
        // Sealed under another AUTH_SECRET, or damaged: it failed, and the
        // person may ask again at once. The log holds no personal data.
        logger.error({ err: error, export: row.id }, "data export cannot be opened");
        await db
          .update(dataExports)
          .set({ failedAt: now, file: null, byteSize: null, updatedAt: now })
          .where(eq(dataExports.id, row.id));
        return undefined;
      }
    },

    async peek(token) {
      const [row] = await db
        .select({ readyAt: dataExports.readyAt, byteSize: dataExports.byteSize })
        .from(dataExports)
        .where(usableLink(token, clock()));
      if (row === undefined || row.readyAt === null || row.byteSize === null) return undefined;
      return { filename: filenameOf(row.readyAt), byteSize: row.byteSize };
    },
  };
}

/** A link that still works: known, within its 2 minutes, to a file not expired. */
function usableLink(token: string, now: Date) {
  return and(
    eq(dataExports.linkHash, hashToken(token)),
    gt(dataExports.linkExpiresAt, now),
    gt(dataExports.expiresAt, now),
    isNotNull(dataExports.file),
    isNull(dataExports.failedAt),
  );
}

/** The job that builds exports, every 10 seconds inside the API. */
export function createExportBuilder(dependencies: ExportBuilderDependencies): ExportBuilder {
  const { db, cipher, clock, logger } = dependencies;

  /**
   * Builds one export taken on its `attempts`-th try; false when another try
   * wrote it first or it was given up meanwhile, so nothing was written.
   */
  async function build(row: ExportRow): Promise<boolean> {
    const now = clock();
    // One snapshot, so the sections agree with each other.
    const { data, files } = await db.transaction(
      async (tx) => ({
        data: await collectExport(tx, row.userId, now),
        files: await collectExportFiles(tx, row.userId),
      }),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    const archive = zip(
      [
        { name: "shareride-data.json", data: Buffer.from(`${JSON.stringify(data, null, 2)}\n`) },
        { name: "shareride-data.html", data: Buffer.from(renderExportPage(data)) },
        ...files,
      ],
      now,
    );
    const file = cipher.seal(archive, row.id);
    // Ready, and the person told by push and email, in one transaction.
    return db.transaction(async (tx) => {
      const [ready] = await tx
        .update(dataExports)
        .set({
          readyAt: now,
          expiresAt: exportExpiresAt(now),
          file,
          byteSize: archive.length,
          updatedAt: now,
        })
        // The first try to finish wins, even one slower than its lease; a
        // later one, or one after the export was given up, writes nothing.
        .where(
          and(
            eq(dataExports.id, row.id),
            isNull(dataExports.readyAt),
            isNull(dataExports.failedAt),
          ),
        )
        .returning({ id: dataExports.id });
      if (ready === undefined) return false;
      await recordEvents(
        tx,
        [{ type: "DataExportReady", userId: row.userId, exportId: row.id }],
        now,
      );
      return true;
    });
  }

  return {
    async buildDue() {
      let built = 0;
      for (;;) {
        const now = clock();
        const leaseEnded = new Date(now.getTime() - exportBuildLeaseMinutes * 60_000);
        // The oldest export waiting, unless a run took it within the lease.
        const row = await db.transaction(async (tx) => {
          const [due] = await tx
            .select()
            .from(dataExports)
            .where(
              and(
                isNull(dataExports.readyAt),
                isNull(dataExports.failedAt),
                or(eq(dataExports.attempts, 0), lt(dataExports.updatedAt, leaseEnded)),
              ),
            )
            .orderBy(dataExports.askedAt)
            .limit(1)
            .for("update", { skipLocked: true });
          if (due === undefined) return undefined;
          // Counted before building, so an export that stops the API is given up too.
          const attempts = due.attempts + 1;
          const givenUp = attempts > exportBuildAttempts;
          await tx
            .update(dataExports)
            .set({ attempts, failedAt: givenUp ? now : null, updatedAt: now })
            .where(eq(dataExports.id, due.id));
          return givenUp ? null : { ...due, attempts };
        });
        if (row === undefined) return built;
        if (row === null) continue;
        try {
          if (await build(row)) built += 1;
        } catch (error) {
          // Tried again once the lease ends; the log holds no personal data.
          logger.error({ err: error, export: row.id }, "data export not built");
        }
      }
    },
  };
}

/**
 * Deletes export files once they expire, and their rows, which hold only
 * dates, 30 days later; the number of each.
 */
export async function cleanUpExports(
  db: Database,
  now: Date,
): Promise<{ readonly exportFiles: number; readonly exportRecords: number }> {
  // All or nothing, so a run's counts are whole. A held person's export
  // goes too: it is a copy of what the hold keeps.
  return db.transaction(async (tx) => {
    const files = await tx
      .update(dataExports)
      .set({ file: null, byteSize: null, linkHash: null, linkExpiresAt: null, updatedAt: now })
      .where(and(isNotNull(dataExports.file), lt(dataExports.expiresAt, now)))
      .returning({ id: dataExports.id });
    // Counted from expiry, or from asking for one never made.
    const records = await tx
      .delete(dataExports)
      .where(
        lt(
          sql`coalesce(${dataExports.expiresAt}, ${dataExports.askedAt})`,
          privacyCutoffs(now).exportRecordsExpiredBefore,
        ),
      )
      .returning({ id: dataExports.id });
    return { exportFiles: files.length, exportRecords: records.length };
  });
}
