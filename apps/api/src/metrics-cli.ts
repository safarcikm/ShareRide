// The `metrics` command: `pnpm --filter @shareride/api metrics recompute
// <weeks>` counts the weekly figures again for this week and the ones
// before it. The API itself counts the last three every night. On a
// server, run it in the API's shell. Needs DATABASE_URL.
import { connectDatabase } from "@shareride/db";
import { createWeeklyMetricsService, runMetricsCommand } from "./modules/metrics/index.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}

const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-metrics",
});
try {
  const clock = () => new Date();
  process.exitCode = await runMetricsCommand(process.argv.slice(2), {
    metrics: createWeeklyMetricsService({ db: connection.db, clock }),
    clock,
    write: (line) => process.stdout.write(`${line}\n`),
  });
} finally {
  await connection.close();
}
