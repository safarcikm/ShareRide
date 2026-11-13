import { z } from "zod";

/** An origin such as https://shareride.is: scheme, host and port, nothing more. */
const originSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}, "not an origin");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Keys the hashes of sign-in codes, phone numbers and rate-limit keys. */
    AUTH_SECRET: z.string().min(32),
    /** Only the development sender exists until milestone 2 adds a provider. */
    SMS_PROVIDER: z.enum(["dev"]).default("dev"),
    /** Web app origins allowed to call the API with cookies, comma-separated. */
    WEB_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin !== ""),
      )
      .pipe(z.array(originSchema)),
    /** True behind a load balancer that sets X-Forwarded-For. */
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.AUTH_SECRET.startsWith("local-only-")) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "the example value is not allowed in production",
      });
    }
    // Only "dev" exists today; the check stays when real providers are added.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (env.NODE_ENV === "production" && env.SMS_PROVIDER === "dev") {
      context.addIssue({
        code: "custom",
        path: ["SMS_PROVIDER"],
        message: "dev prints codes in the terminal and is not allowed in production",
      });
    }
  });

export interface Config {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly databaseUrl: string;
  readonly authSecret: string;
  readonly smsProvider: "dev";
  readonly webOrigins: readonly string[];
  readonly trustProxy: boolean;
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
        const variable = String(issue.path[0]);
        if (issue.code === "invalid_type" && issue.input === undefined)
          return `${variable}: missing`;
        if (issue.code === "custom" && issue.path.length === 1) {
          return `${variable}: ${issue.message}`;
        }
        return `${variable}: invalid (${issue.code})`;
      }),
    );
  }
  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    authSecret: env.AUTH_SECRET,
    smsProvider: env.SMS_PROVIDER,
    webOrigins: env.WEB_ORIGINS,
    trustProxy: env.TRUST_PROXY,
  };
}
