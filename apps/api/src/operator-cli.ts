// The `operator` command (ADR 0028), the only way to give or take away the
// operator role: `pnpm --filter @shareride/api operator add <user ID or phone
// number>` prints a setup link for the first passkey; `remove` takes the role
// away and `list` lists operators. On a server, run it in the API's shell.
// Needs DATABASE_URL, and ADMIN_ORIGIN outside development to add one.
import { connectDatabase } from "@shareride/db";
import { ConfigError, loadAdminOrigin } from "./config.ts";
import {
  createOperatorSessionService,
  createPasskeyService,
  runOperatorCommand,
} from "./modules/admin/index.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}

let adminOrigin: string | undefined;
try {
  adminOrigin = loadAdminOrigin(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-operator",
});
try {
  const clock = () => new Date();
  const sessions = createOperatorSessionService({ db: connection.db, clock });
  process.exitCode = await runOperatorCommand(process.argv.slice(2), {
    db: connection.db,
    adminOrigin,
    sessions,
    // Without an origin only `add` refuses; removing and listing still work.
    passkeys: createPasskeyService({
      db: connection.db,
      clock,
      sessions,
      adminOrigin: adminOrigin ?? "http://localhost",
    }),
    write: (line) => process.stdout.write(`${line}\n`),
  });
} finally {
  await connection.close();
}
