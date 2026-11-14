// Deletes sign-in records past their retention and ends idle sessions:
// `pnpm --filter @shareride/api clean-up` locally, and every hour as a cron
// job on staging and production (ADR 0018). Needs only DATABASE_URL.
import { connectDatabase } from "@shareride/db";
import { createLogger } from "./logger.ts";
import { cleanUpSignInRecords } from "./modules/auth/clean-up.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}

const logger = createLogger({ level: "info" });
const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-clean-up",
});
try {
  const counts = await cleanUpSignInRecords(connection.db, new Date());
  logger.info({ counts }, "clean-up done");
} catch (error) {
  logger.error({ err: error }, "clean-up failed");
  process.exitCode = 1;
} finally {
  await connection.close();
}
