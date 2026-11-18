// Adds the draft legal documents and the sample meeting points to
// DATABASE_URL for local development (`pnpm --filter @shareride/db seed`).
// Never run against production (see seed-guard.ts).
import { connectDatabase } from "./index.ts";
import { seedRefusal } from "./seed-guard.ts";
import { developmentInviteCode, seedDevelopmentData, seedDevelopmentInviteCode } from "./seed.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}
const refusal = seedRefusal(process.env);
if (refusal !== null) {
  process.stderr.write(`${refusal}\n`);
  process.exit(1);
}

const connection = connectDatabase(url, { maxConnections: 1, applicationName: "shareride-seed" });
try {
  await seedDevelopmentData(connection.db, new Date());
  process.stdout.write("Draft legal documents and sample meeting points are in place.\n");
  // The public development code is for a developer's own machine only.
  const appEnv = process.env["APP_ENV"];
  if (appEnv === undefined || appEnv === "local") {
    await seedDevelopmentInviteCode(connection.db, new Date());
    process.stdout.write(`The invite code for a new account is ${developmentInviteCode}.\n`);
  } else {
    process.stdout.write(
      "No invite code was made here: make one with the API's `invite add` command.\n",
    );
  }
} finally {
  await connection.close();
}
