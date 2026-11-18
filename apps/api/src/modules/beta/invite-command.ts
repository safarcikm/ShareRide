import type { InviteService } from "./invites.ts";

export interface InviteCommandDependencies {
  readonly invites: Pick<InviteService, "create">;
  readonly clock: () => Date;
  readonly write: (line: string) => void;
}

const usage = [
  "Usage:",
  '  invite add "<name>" <uses> [days]  make a group code and print it (30 days if not said)',
].join("\n");

const defaultDays = 30;
const wholeNumber = /^\d{1,4}$/;

/**
 * The `invite` command: makes a group code on the server, for the first
 * account of a new environment, before any operator exists to make one in
 * the console (spec 12, 3.2.2). Returns the exit code.
 */
export async function runInviteCommand(
  args: readonly string[],
  { invites, clock, write }: InviteCommandDependencies,
): Promise<number> {
  const [command, name, uses, days = String(defaultDays), ...rest] = args;
  if (
    command !== "add" ||
    name === undefined ||
    uses === undefined ||
    !wholeNumber.test(uses) ||
    !wholeNumber.test(days) ||
    rest.length > 0
  ) {
    write(usage);
    return 1;
  }
  const expiresAt = new Date(clock().getTime() + Number(days) * 24 * 60 * 60 * 1000);
  const made = await invites.create({ name, uses: Number(uses), expiresAt });
  if (!made.ok) {
    write(`The code was not made: ${made.error.code}.`);
    write(usage);
    return 1;
  }
  write(`Invite code ${made.value.code} for "${made.value.name}":`);
  write(
    `  ${String(made.value.usesAllowed)} uses, until ${made.value.expiresAt.toISOString().slice(0, 10)}`,
  );
  return 0;
}
