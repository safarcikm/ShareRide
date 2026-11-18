// The `invite` command: `pnpm --filter @shareride/api invite add "<name>"
// <uses> [days]` makes a group invite code and prints it, for the first
// account on a new server, before any operator exists to make one in the
// console. On a server, run it in the API's shell. Needs DATABASE_URL.
import { randomInt } from "node:crypto";
import { connectDatabase } from "@shareride/db";
import { createInviteService, runInviteCommand } from "./modules/beta/index.ts";
import { createSettingsService } from "./modules/settings/index.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}

const connection = connectDatabase(url, { maxConnections: 1, applicationName: "shareride-invite" });
try {
  const clock = () => new Date();
  const { db } = connection;
  process.exitCode = await runInviteCommand(process.argv.slice(2), {
    invites: createInviteService({
      db,
      clock,
      settings: createSettingsService({ db, clock }),
      randomInt: (max) => randomInt(max),
    }),
    clock,
    write: (line) => process.stdout.write(`${line}\n`),
  });
} finally {
  await connection.close();
}
