import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export interface Config {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly databaseUrl: string;
}

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid environment:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/**
 * Reads and validates the environment once, at start-up, so a missing or
 * wrong variable stops the API immediately with a clear message.
 */
export function loadConfig(environment: Readonly<Record<string, string | undefined>>): Config {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    // Name the variable and the rule only: values can contain passwords.
    throw new ConfigError(
      result.error.issues.map((issue) => {
        const variable = issue.path.join(".");
        return issue.code === "invalid_type" && issue.input === undefined
          ? `${variable}: missing`
          : `${variable}: invalid (${issue.code})`;
      }),
    );
  }
  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
  };
}
