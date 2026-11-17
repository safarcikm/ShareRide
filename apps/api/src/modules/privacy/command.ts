import type { BeforeRestore, Erasure } from "./erasure.ts";

/** Reads the database in use before the restore. */
export type ReadBeforeRestore = () => Promise<BeforeRestore>;

export interface PrivacyCommandDependencies {
  readonly erasure: Pick<Erasure, "reapply">;
  /** Undefined when the old database is not given (or lost). */
  readonly before: ReadBeforeRestore | undefined;
  readonly write: (line: string) => void;
}

const usage = [
  "Usage:",
  "  privacy reapply-erasures   after a restore, erase again every erased account that came back",
  "                             (PREVIOUS_DATABASE_URL: the old database, for what changed there since)",
].join("\n");

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The `privacy` command (plan, decision 3), for the operator until the
 * console has privacy pages. Answers the exit code: 0 done, 1 an account
 * failed, 2 used wrongly.
 */
export async function runPrivacyCommand(
  args: readonly string[],
  { erasure, before, write }: PrivacyCommandDependencies,
): Promise<number> {
  const [action, ...rest] = args;
  if (action !== "reapply-erasures" || rest.length > 0) {
    write(usage);
    return 2;
  }
  let read: BeforeRestore | undefined;
  if (before !== undefined) {
    read = await before();
    write(
      `The old database lists ${counted(read.erasures.length, "erased account", "erased accounts")}.`,
    );
  }
  const counts = await erasure.reapply(read);
  if (read !== undefined) {
    write(`Deletion dates taken from the old database: ${String(counts.datesTaken)}.`);
  }
  write(
    counts.erased === 0
      ? "No erased account came back with the restore."
      : `Erased again: ${counted(counts.erased, "account", "accounts")} that came back with the restore.`,
  );
  if (counts.failed === 0) return 0;
  write(
    `Failed: ${counted(counts.failed, "account", "accounts")}, each in the log. Fix it and run this again before the services use this database.`,
  );
  return 1;
}
