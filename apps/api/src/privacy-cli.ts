// The `privacy` command (spec 11; plan, decision 3), until the console has
// privacy pages: `pnpm --filter @shareride/api privacy runs` shows the last
// run of each retention rule; `holds`, `hold` and `end-hold` list, set and
// end holds, each in the audit log; `reapply-erasures` after a restore
// erases again every erased account that came back (runbook, "Restore the
// database"). On a server, run it in the API's shell. Needs DATABASE_URL
// and AUTH_SECRET, the API's own; for `reapply-erasures`,
// PREVIOUS_DATABASE_URL, the old database, when it can be reached, for the
// deletions asked for, undone and finished after the restore's point.
import { connectDatabase, schema } from "@shareride/db";
import { tripDaySettingsFrom } from "@shareride/domain";
import { createLogger } from "./logger.ts";
import { runPrivacyCommand } from "./modules/privacy/command.ts";
import { createErasure } from "./modules/privacy/erasure.ts";
import { settingValuesIn } from "./modules/settings/index.ts";
import { createKeyedHasher } from "./platform/crypto.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}
const authSecret = process.env["AUTH_SECRET"];
if (authSecret === undefined || authSecret === "") {
  process.stderr.write("AUTH_SECRET is not set: the API's own secret, the same value.\n");
  process.exit(1);
}

const previousUrl = process.env["PREVIOUS_DATABASE_URL"];

const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-privacy",
});
try {
  process.exitCode = await runPrivacyCommand(process.argv.slice(2), {
    db: connection.db,
    clock: () => new Date(),
    erasure: createErasure({
      db: connection.db,
      clock: () => new Date(),
      hasher: createKeyedHasher(authSecret),
      // The completion delay as it is now (ADR 0032).
      tripDaySettings: tripDaySettingsFrom(await settingValuesIn(connection.db)),
      logger: createLogger({ level: "info" }),
    }),
    before:
      previousUrl === undefined || previousUrl === ""
        ? undefined
        : async () => {
            const old = connectDatabase(previousUrl, {
              maxConnections: 1,
              applicationName: "shareride-privacy",
            });
            try {
              const { users } = schema;
              return {
                erasures: await old.db.select().from(schema.erasedAccounts),
                accounts: await old.db
                  .select({
                    userId: users.id,
                    deleteAfter: users.deleteAfter,
                    updatedAt: users.updatedAt,
                  })
                  .from(users),
              };
            } finally {
              await old.close();
            }
          },
    write: (line) => process.stdout.write(`${line}\n`),
  });
} finally {
  await connection.close();
}
