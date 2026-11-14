/**
 * Why the draft legal documents must not be seeded here, or null when they
 * may. APP_ENV names the deployment (local, staging or production); staging
 * runs with NODE_ENV=production but still uses the drafts.
 */
export function seedRefusal(env: Readonly<Record<string, string | undefined>>): string | null {
  const appEnv = env["APP_ENV"];
  if (appEnv !== undefined && !["local", "staging", "production"].includes(appEnv)) {
    return `APP_ENV must be local, staging or production, not "${appEnv}".`;
  }
  if (appEnv === "production" || (appEnv === undefined && env["NODE_ENV"] === "production")) {
    return "The seed adds draft documents and sample meeting points, and is not for production.";
  }
  return null;
}
