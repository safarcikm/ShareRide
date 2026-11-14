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
    /**
     * `dev` prints codes in the terminal; `vonage` sends real SMS, and
     * `46elks` is the fallback (ADR 0023).
     */
    SMS_PROVIDER: z.enum(["dev", "vonage", "46elks"]).default("dev"),
    VONAGE_API_KEY: z.string().min(1).optional(),
    VONAGE_API_SECRET: z.string().min(1).optional(),
    ELKS_API_USERNAME: z.string().min(1).optional(),
    ELKS_API_PASSWORD: z.string().min(1).optional(),
    /** The name the recipient sees: up to 11 letters and digits, starting with a letter. */
    SMS_SENDER: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9]{0,10}$/)
      .default("ShareRide"),
    /** The kill switch: every sign-in code fails to send while true. */
    SMS_PAUSED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
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
    /**
     * How many proxies in front of the API append to X-Forwarded-For: false
     * (none, the default), true (one load balancer) or a count. Render is 2:
     * Cloudflare, then Render's own proxy.
     */
    TRUST_PROXY: z
      .string()
      .default("false")
      .transform((value) => (value === "false" ? "0" : value === "true" ? "1" : value))
      .pipe(z.enum(["0", "1", "2", "3", "4", "5"]))
      .transform(Number),
    /** The exported web app, served on the API's own origin (staging, production). */
    WEB_APP_DIR: z.string().min(1).optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.AUTH_SECRET.startsWith("local-only-")) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "the example value is not allowed in production",
      });
    }
    if (env.NODE_ENV === "production" && env.SMS_PROVIDER === "dev") {
      context.addIssue({
        code: "custom",
        path: ["SMS_PROVIDER"],
        message: "dev prints codes in the terminal and is not allowed in production",
      });
    }
    const providerKeys = {
      dev: [],
      vonage: ["VONAGE_API_KEY", "VONAGE_API_SECRET"],
      "46elks": ["ELKS_API_USERNAME", "ELKS_API_PASSWORD"],
    } as const;
    for (const key of providerKeys[env.SMS_PROVIDER]) {
      if (env[key] === undefined) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `needed when SMS_PROVIDER is ${env.SMS_PROVIDER}`,
        });
      }
    }
  });

export type SmsConfig =
  | { readonly provider: "dev"; readonly paused: boolean }
  | {
      readonly provider: "vonage";
      readonly apiKey: string;
      readonly apiSecret: string;
      readonly sender: string;
      readonly paused: boolean;
    }
  | {
      readonly provider: "46elks";
      readonly username: string;
      readonly password: string;
      readonly sender: string;
      readonly paused: boolean;
    };

export interface Config {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly databaseUrl: string;
  readonly authSecret: string;
  readonly sms: SmsConfig;
  readonly webOrigins: readonly string[];
  /** Proxies in front of the API that append to X-Forwarded-For. */
  readonly trustedProxies: number;
  readonly webAppDir: string | undefined;
  readonly errorReporting: ErrorReportingConfig;
}

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid environment:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

export interface ErrorReportingConfig {
  /** Where Sentry reports go; nothing is sent without it. */
  readonly dsn: string | undefined;
  readonly environment: "local" | "staging" | "production";
  /** The commit the running code was built from. */
  readonly release: string | undefined;
}

const errorReportingSchema = z.object({
  /** Reports are stored in Sentry's EU region only (ADR 0020). */
  SENTRY_DSN: z
    .url({ protocol: /^https$/ })
    .refine((dsn) => new URL(dsn).hostname.endsWith(".ingest.de.sentry.io"), {
      message: "not in Sentry's EU region (*.ingest.de.sentry.io)",
    })
    .optional(),
  /** Read by the SDK itself, and would turn on tracing. */
  SENTRY_TRACES_SAMPLE_RATE: z
    .custom<undefined>((value) => value === undefined, {
      message: "not used, error reports only (ADR 0020)",
    })
    .optional(),
  /** The deployment, shared with the seed guard. */
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  SENTRY_RELEASE: z.string().min(1).optional(),
  /** Set by Render to the commit it built. */
  RENDER_GIT_COMMIT: z.string().min(1).optional(),
});

/**
 * The error tracking settings alone, for commands such as the clean-up that
 * do not need the rest of the API's settings.
 */
export function loadErrorReportingConfig(
  environment: Readonly<Record<string, string | undefined>>,
): ErrorReportingConfig {
  const env = parseOrThrow(errorReportingSchema, environment);
  return {
    dsn: env.SENTRY_DSN,
    environment: env.APP_ENV,
    release: env.SENTRY_RELEASE ?? env.RENDER_GIT_COMMIT,
  };
}

/** Parses, or throws a ConfigError that names each variable and rule, never a value. */
function parseOrThrow<T>(schema: z.ZodType<T>, environment: unknown): T {
  const result = schema.safeParse(environment);
  if (result.success) return result.data;
  throw new ConfigError(
    result.error.issues.map((issue) => {
      const variable = String(issue.path[0]);
      if (issue.code === "invalid_type" && issue.input === undefined) return `${variable}: missing`;
      if (issue.code === "custom" && issue.path.length === 1) {
        return `${variable}: ${issue.message}`;
      }
      return `${variable}: invalid (${issue.code})`;
    }),
  );
}

/** The SMS settings for the provider chosen; the schema checked its keys are there. */
function smsConfig(env: z.infer<typeof environmentSchema>): SmsConfig {
  const paused = env.SMS_PAUSED;
  const sender = env.SMS_SENDER;
  switch (env.SMS_PROVIDER) {
    case "vonage":
      return {
        provider: "vonage",
        apiKey: env.VONAGE_API_KEY ?? "",
        apiSecret: env.VONAGE_API_SECRET ?? "",
        sender,
        paused,
      };
    case "46elks":
      return {
        provider: "46elks",
        username: env.ELKS_API_USERNAME ?? "",
        password: env.ELKS_API_PASSWORD ?? "",
        sender,
        paused,
      };
    case "dev":
      return { provider: "dev", paused };
  }
}

/**
 * Reads and validates the environment once, at start-up, so a missing or
 * wrong variable stops the API immediately with a clear message.
 */
export function loadConfig(environment: Readonly<Record<string, string | undefined>>): Config {
  const env = parseOrThrow(environmentSchema, environment);
  const errorReporting = loadErrorReportingConfig(environment);
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    authSecret: env.AUTH_SECRET,
    sms: smsConfig(env),
    webOrigins: env.WEB_ORIGINS,
    trustedProxies: env.TRUST_PROXY,
    webAppDir: env.WEB_APP_DIR,
    errorReporting,
  };
}
