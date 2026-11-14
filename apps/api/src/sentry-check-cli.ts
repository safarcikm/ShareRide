// Sends one test error to Sentry and waits for it to leave, to check a
// deployment's error reporting: `pnpm --filter @shareride/api sentry:check`
// locally, `node apps/api/src/sentry-check-cli.ts` in a Render shell.
import * as Sentry from "@sentry/node";
import { ConfigError, loadErrorReportingConfig, type ErrorReportingConfig } from "./config.ts";
import { startErrorReporting } from "./platform/error-reporting.ts";

let config: ErrorReportingConfig;
try {
  config = loadErrorReportingConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
const report = startErrorReporting(config);
if (report === undefined) {
  process.stderr.write("SENTRY_DSN is not set, so there is nothing to check.\n");
  process.exit(1);
}

report(new Error(`Sentry check from ${config.environment}`), {
  method: "check",
  route: "sentry-check",
  requestId: undefined,
});
const sent = await Sentry.flush(5000);
const eventId = Sentry.lastEventId() ?? "unknown";
process.stdout.write(
  sent
    ? `Sent test error ${eventId} (release ${config.release ?? "not set"}). If it is not in Sentry within a minute, check SENTRY_DSN.\n`
    : "The test error could not be sent within 5 seconds.\n",
);
process.exitCode = sent ? 0 : 1;
