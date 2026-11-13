// Applies pending migrations to DATABASE_URL. Used locally
// (`pnpm --filter @shareride/db migrate`) and before each deploy.
import { connectDatabase, migrateDatabase } from "./index.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}

const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-migrate",
});
try {
  await migrateDatabase(connection.db);
  process.stdout.write("Migrations applied.\n");
} finally {
  await connection.close();
}
