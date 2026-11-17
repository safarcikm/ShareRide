import type { ErasedAccount, Erasure } from "./erasure.ts";

/** Reads `erased_accounts` from the database in use before the restore. */
export type PreviousErasures = () => Promise<readonly ErasedAccount[]>;

export interface PrivacyCommandDependencies {
  readonly erasure: Pick<Erasure, "reapply">;
  /** Undefined when the old database is not given (or lost). */
  readonly previous: PreviousErasures | undefined;
  readonly write: (line: string) => void;
}

const usage = [
  "Usage:",
  "  privacy reapply-erasures   after a restore, erase again every erased account that came back",
  "                             (PREVIOUS_DATABASE_URL: the old database, to read its erasures)",
].join("\n");

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The `privacy` command (plan, decision 3), for the operator until the
 * console has privacy pages. Answers the exit code: 0 done, 2 used wrongly.
 */
export async function runPrivacyCommand(
  args: readonly string[],
  { erasure, previous, write }: PrivacyCommandDependencies,
): Promise<number> {
  const [action, ...rest] = args;
  if (action === "reapply-erasures" && rest.length === 0) {
    let listed: readonly ErasedAccount[] = [];
    if (previous !== undefined) {
      listed = await previous();
      write(
        `The old database lists ${counted(listed.length, "erased account", "erased accounts")}.`,
      );
    }
    const erased = await erasure.reapply(listed);
    write(
      erased === 0
        ? "No erased account came back with the restore."
        : `Erased again: ${counted(erased, "account", "accounts")} that came back with the restore.`,
    );
    return 0;
  }
  write(usage);
  return 2;
}
