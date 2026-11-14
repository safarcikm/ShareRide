// Applies pending migrations to DATABASE_URL. Used locally
// (`pnpm --filter @shareride/db migrate`) and before each deploy. With
// --seed-drafts it then adds the draft legal documents and the sample
// meeting points, as staging's pre-deploy command does: one command, so it
// needs no shell.
import { connectDatabase, migrateDatabase } from "./index.ts";
import { seedRefusal } from "./seed-guard.ts";
import { seedDevelopmentData } from "./seed.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}
const seedDrafts = process.argv.includes("--seed-drafts");
const refusal = seedDrafts ? seedRefusal(process.env) : null;
if (refusal !== null) {
  process.stderr.write(`${refusal}\n`);
  process.exit(1);
}

const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-migrate",
});
try {
  await migrateDatabase(connection.db);
  process.stdout.write("Migrations applied.\n");
  if (seedDrafts) {
    await seedDevelopmentData(connection.db, new Date());
    process.stdout.write("Draft legal documents and sample meeting points are in place.\n");
  }
} finally {
  await connection.close();
}
