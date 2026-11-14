// Runs in the image build (apps/api/Dockerfile) after the web export: sends
// the web app's source maps to Sentry when the build has an auth token, so
// error reports show the original code, then deletes them so the site never
// serves them (ADR 0020, runbook "Error reports and uptime").
//   node scripts/upload-source-maps.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

// Expo's types leave process.env untyped.
const env = process.env as Record<string, string | undefined>;
const app = resolve(import.meta.dirname, "..");
const bundles = join(app, "dist", "_expo", "static", "js", "web");
/** Render gives a build its secret files as BuildKit secrets, mounted here. */
const tokenFile = env["SENTRY_AUTH_TOKEN_FILE"] ?? "/run/secrets/sentry-auth-token";
const token = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "";
const release = env["EXPO_PUBLIC_RELEASE"] ?? "";

if (token === "") {
  process.stdout.write("No Sentry auth token: source maps are not uploaded.\n");
} else if ((env["EXPO_PUBLIC_SENTRY_DSN"] ?? "") === "") {
  process.stdout.write("No EXPO_PUBLIC_SENTRY_DSN: the app sends no reports, so no upload.\n");
} else {
  try {
    execFileSync(
      join(app, "node_modules", ".bin", "sentry-cli"),
      [
        "sourcemaps",
        "upload",
        "--project",
        "shareride-app",
        ...(release === "" ? [] : ["--release", release]),
        bundles,
      ],
      {
        stdio: "inherit",
        // The organisation is in the token; its data is in the EU region.
        env: { ...process.env, SENTRY_AUTH_TOKEN: token, SENTRY_URL: "https://de.sentry.io/" },
      },
    );
  } catch {
    // A deploy should not wait on Sentry; reports then show minified code.
    process.stdout.write(
      "WARNING: the source map upload failed (see above). The deploy goes on; error reports from this build show minified code.\n",
    );
  }
}

const maps = readdirSync(bundles).filter((name) => name.endsWith(".map"));
for (const name of maps) rmSync(join(bundles, name));
process.stdout.write(`Deleted ${String(maps.length)} source maps from the export.\n`);
