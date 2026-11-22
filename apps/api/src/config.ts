import { createPrivateKey } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { operatorPasswordRules } from "@shareride/domain";

/** An origin such as https://shareride.is: scheme, host and port, nothing more. */
const originSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}, "not an origin");

/** Apple's team and key identifiers. */
const appleIdentifier = /^[A-Z0-9]{10}$/;

/** Whether the text is a private key on the P-256 curve, as Apple's keys are. */
function isP256Key(pem: string): boolean {
  try {
    const key = createPrivateKey(pem);
    return key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1";
  } catch {
    return false;
  }
}

/** An empty value counts as unset, as Render's empty `sync: false` entries are. */
const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

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
      .default("PuffinRide"),
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
    /** The operator console's build, served at /admin (ADR 0028). */
    ADMIN_APP_DIR: z.string().min(1).optional(),
    /**
     * The deployment: local, staging or production. Unset, it is production
     * when NODE_ENV is, as for the seed guard.
     */
    APP_ENV: z.enum(["local", "staging", "production"]).optional(),
    /**
     * Who takes payments: `test` is the app's own test sheet, where no money
     * moves (milestone 4); `none` turns paying off. By default `test`,
     * except in production, where it is refused.
     */
    PAYMENT_PROVIDER: z.enum(["none", "test"]).optional(),
    /**
     * `off` stops the notification worker in this process, such as on an
     * instance that only serves requests; the worker runs every 5 seconds
     * otherwise (milestone 5 plan, decision 2).
     */
    WORKER: z
      .enum(["on", "off"])
      .default("on")
      .transform((value) => value === "on"),
    /**
     * Expo's access token, needed once "enhanced push security" is on for
     * the project; push works without it until then (plan 4.5).
     */
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    /**
     * `mailjet` sends email (ADR 0027); `dev` prints it in the terminal;
     * `none` sends none. By default `dev`, except under NODE_ENV=production
     * (staging too), where it is `none` until set.
     */
    EMAIL_PROVIDER: z.enum(["none", "dev", "mailjet"]).optional(),
    MAILJET_API_KEY: z.string().min(1).optional(),
    MAILJET_SECRET_KEY: z.string().min(1).optional(),
    /** The sender's address, on a domain validated in Mailjet. */
    EMAIL_FROM: z.email().optional(),
    EMAIL_FROM_NAME: z.string().min(1).max(60).default("PuffinRide"),
    /** Where links in emails lead: the web app's origin. */
    WEB_APP_URL: originSchema.optional(),
    /**
     * The operator console's origin, which its passkeys are bound to (ADR
     * 0028). In development it is the API's own http://localhost:PORT; on a
     * server, the console's sign-in is off until it is set.
     */
    ADMIN_ORIGIN: originSchema.optional(),
    /**
     * The console's temporary password (ADRs 0041 and 0044, production
     * too): with it, an operator signs in with their phone number and this
     * password as well as with a passkey. Unset, password sign-in is off.
     */
    ADMIN_PASSWORD: unsetIfEmpty(z.string().min(operatorPasswordRules.minLength).optional()),
    /**
     * Where meeting point and profile photos are kept (ADRs 0022 and
     * 0033): `hetzner` is the
     * Hetzner Object Storage bucket; `folder` a folder on this computer,
     * for development and tests; `none` takes no photos. By default
     * `folder`, except under NODE_ENV=production (staging too), where it is
     * `none` until the bucket is set.
     */
    PHOTO_STORAGE: z.enum(["none", "folder", "hetzner"]).optional(),
    PHOTO_FOLDER: z.string().min(1).optional(),
    /** The bucket's location, such as https://nbg1.your-objectstorage.com. */
    PHOTO_BUCKET_ENDPOINT: originSchema
      .refine((value) => value.startsWith("https://"), "not https")
      .optional(),
    /** The bucket's name: lowercase letters, digits, dots and hyphens. */
    PHOTO_BUCKET: z
      .string()
      // No dots: the bucket's address is a host name under the endpoint's certificate.
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
      .optional(),
    PHOTO_BUCKET_ACCESS_KEY: z.string().min(1).optional(),
    PHOTO_BUCKET_SECRET_KEY: z.string().min(1).optional(),
    /**
     * Signing in with Google (ADR 0034): `google` with its web client;
     * `dev`, our stand-in for development and tests; `off`. By default
     * `dev`, except under NODE_ENV=production (staging too), where it is
     * `off` until set and `dev` is refused.
     */
    GOOGLE_SIGN_IN: unsetIfEmpty(z.enum(["off", "dev", "google"]).optional()),
    GOOGLE_CLIENT_ID: unsetIfEmpty(z.string().min(1).optional()),
    GOOGLE_CLIENT_SECRET: unsetIfEmpty(z.string().min(1).optional()),
    /**
     * Sign in with Apple (ADR 0034): `apple` with a Services ID and the
     * team's key; `dev` and `off` as for Google.
     */
    APPLE_SIGN_IN: unsetIfEmpty(z.enum(["off", "dev", "apple"]).optional()),
    APPLE_SERVICES_ID: unsetIfEmpty(z.string().min(1).optional()),
    /** Apple's team and key identifiers: ten capital letters and digits each. */
    APPLE_TEAM_ID: unsetIfEmpty(z.string().regex(appleIdentifier).optional()),
    APPLE_KEY_ID: unsetIfEmpty(z.string().regex(appleIdentifier).optional()),
    /** The key's .p8 file (PKCS #8 PEM); `\n` may stand for its line breaks. */
    APPLE_PRIVATE_KEY: unsetIfEmpty(
      z
        .string()
        .transform((pem) => pem.replaceAll("\\n", "\n"))
        .refine(isP256Key, "must be the .p8 file of a key with Sign in with Apple")
        .optional(),
    ),
    /**
     * Where browsers reach the API, for the sign-in providers' callback
     * addresses: http://localhost:PORT locally; needed on a server once a
     * provider is on.
     */
    API_ORIGIN: unsetIfEmpty(originSchema.optional()),
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
    if (deploymentOf(env) === "production" && env.PAYMENT_PROVIDER === "test") {
      context.addIssue({
        code: "custom",
        path: ["PAYMENT_PROVIDER"],
        message: "the test provider moves no money and is not allowed in production",
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
    if (env.NODE_ENV === "production" && env.EMAIL_PROVIDER === "dev") {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message: "dev prints emails in the terminal and is not allowed in production",
      });
    }
    if (env.NODE_ENV === "production" && env.PHOTO_STORAGE === "folder") {
      context.addIssue({
        code: "custom",
        path: ["PHOTO_STORAGE"],
        message: "a folder loses its photos on each deploy and is not allowed in production",
      });
    }
    if (env.PHOTO_STORAGE === "hetzner") {
      for (const key of [
        "PHOTO_BUCKET_ENDPOINT",
        "PHOTO_BUCKET",
        "PHOTO_BUCKET_ACCESS_KEY",
        "PHOTO_BUCKET_SECRET_KEY",
      ] as const) {
        if (env[key] === undefined) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "needed when PHOTO_STORAGE is hetzner",
          });
        }
      }
    }
    if (env.NODE_ENV === "production" && env.GOOGLE_SIGN_IN === "dev") {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_SIGN_IN"],
        message: "dev signs anyone in as made-up people and is not allowed in production",
      });
    }
    if (env.NODE_ENV === "production" && env.APPLE_SIGN_IN === "dev") {
      context.addIssue({
        code: "custom",
        path: ["APPLE_SIGN_IN"],
        message: "dev signs anyone in as made-up people and is not allowed in production",
      });
    }
    if (env.APPLE_SIGN_IN === "apple") {
      for (const key of [
        "APPLE_SERVICES_ID",
        "APPLE_TEAM_ID",
        "APPLE_KEY_ID",
        "APPLE_PRIVATE_KEY",
        ...(env.NODE_ENV === "production" ? (["API_ORIGIN"] as const) : []),
      ] as const) {
        if (env[key] === undefined) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "needed when APPLE_SIGN_IN is apple",
          });
        }
      }
    }
    if (env.GOOGLE_SIGN_IN === "google") {
      const needed = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
      for (const key of env.NODE_ENV === "production"
        ? [...needed, "API_ORIGIN" as const]
        : needed) {
        if (env[key] === undefined) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "needed when GOOGLE_SIGN_IN is google",
          });
        }
      }
    }
    if (
      env.NODE_ENV === "production" &&
      env.API_ORIGIN !== undefined &&
      !env.API_ORIGIN.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["API_ORIGIN"],
        message: "must be https in production, where Google and Apple send the person back to it",
      });
    }
    if (env.EMAIL_PROVIDER === "mailjet") {
      for (const key of [
        "MAILJET_API_KEY",
        "MAILJET_SECRET_KEY",
        "EMAIL_FROM",
        "WEB_APP_URL",
      ] as const) {
        if (env[key] === undefined) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "needed when EMAIL_PROVIDER is mailjet",
          });
        }
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

/** The deployment, as the seed guard reads it: unset means production under NODE_ENV=production. */
function deploymentOf(env: {
  readonly APP_ENV?: "local" | "staging" | "production" | undefined;
  readonly NODE_ENV: string;
}): "local" | "staging" | "production" {
  return env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : "local");
}

export type EmailConfig =
  | { readonly provider: "none" }
  | { readonly provider: "dev"; readonly webAppUrl: string }
  | {
      readonly provider: "mailjet";
      readonly apiKey: string;
      readonly secretKey: string;
      readonly from: { readonly email: string; readonly name: string };
      readonly webAppUrl: string;
    };

/** The Expo web app's address when it runs locally (`pnpm --filter @shareride/mobile dev`). */
const localWebApp = "http://localhost:8081";

/** The email settings for the provider chosen; the schema checked its keys are there. */
function emailConfig(env: z.infer<typeof environmentSchema>): EmailConfig {
  const provider = env.EMAIL_PROVIDER ?? (env.NODE_ENV === "production" ? "none" : "dev");
  switch (provider) {
    case "none":
      return { provider };
    case "dev":
      return { provider, webAppUrl: env.WEB_APP_URL ?? localWebApp };
    case "mailjet":
      return {
        provider,
        apiKey: env.MAILJET_API_KEY ?? "",
        secretKey: env.MAILJET_SECRET_KEY ?? "",
        from: { email: env.EMAIL_FROM ?? "", name: env.EMAIL_FROM_NAME },
        webAppUrl: env.WEB_APP_URL ?? "",
      };
  }
}

export type PhotoStorageConfig =
  | { readonly provider: "none" }
  | { readonly provider: "folder"; readonly folder: string }
  | {
      readonly provider: "hetzner";
      readonly endpoint: string;
      readonly bucket: string;
      readonly accessKey: string;
      readonly secretKey: string;
    };

/** The photo storage chosen; the schema checked the bucket's settings are there. */
function photoStorageConfig(env: z.infer<typeof environmentSchema>): PhotoStorageConfig {
  const provider = env.PHOTO_STORAGE ?? (env.NODE_ENV === "production" ? "none" : "folder");
  switch (provider) {
    case "none":
      return { provider };
    case "folder":
      return { provider, folder: env.PHOTO_FOLDER ?? join(tmpdir(), "shareride-photos") };
    case "hetzner":
      return {
        provider,
        endpoint: env.PHOTO_BUCKET_ENDPOINT ?? "",
        bucket: env.PHOTO_BUCKET ?? "",
        accessKey: env.PHOTO_BUCKET_ACCESS_KEY ?? "",
        secretKey: env.PHOTO_BUCKET_SECRET_KEY ?? "",
      };
  }
}

export type AppleSignInConfig =
  | { readonly mode: "off" }
  | { readonly mode: "dev" }
  | {
      readonly mode: "apple";
      readonly servicesId: string;
      readonly teamId: string;
      readonly keyId: string;
      readonly privateKey: string;
    };

export type GoogleSignInConfig =
  | { readonly mode: "off" }
  | { readonly mode: "dev" }
  | { readonly mode: "google"; readonly clientId: string; readonly clientSecret: string };

/** Google and Apple sign-in through our API (ADR 0034). */
export interface SignInConfig {
  readonly google: GoogleSignInConfig;
  readonly apple: AppleSignInConfig;
  /** Where browsers reach the API, for the callback addresses. */
  readonly apiOrigin: string;
  /** The web app's origins, whose /sign-in/return the browser window may go back to. */
  readonly returnOrigins: readonly string[];
  /**
   * Expo Go's exp:// return addresses: in development with the stand-in
   * only, never on a server.
   */
  readonly allowExpoGo: boolean;
}

function signInConfig(env: z.infer<typeof environmentSchema>): SignInConfig {
  const production = env.NODE_ENV === "production";
  const mode = env.GOOGLE_SIGN_IN ?? (production ? "off" : "dev");
  const appleMode = env.APPLE_SIGN_IN ?? (production ? "off" : "dev");
  const webAppUrl = env.WEB_APP_URL ?? (production ? undefined : localWebApp);
  return {
    google:
      mode === "google"
        ? {
            mode,
            clientId: env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
          }
        : { mode },
    apple:
      appleMode === "apple"
        ? {
            mode: appleMode,
            servicesId: env.APPLE_SERVICES_ID ?? "",
            teamId: env.APPLE_TEAM_ID ?? "",
            keyId: env.APPLE_KEY_ID ?? "",
            privateKey: env.APPLE_PRIVATE_KEY ?? "",
          }
        : { mode: appleMode },
    apiOrigin: env.API_ORIGIN ?? `http://localhost:${String(env.PORT)}`,
    returnOrigins: [
      ...new Set([...env.WEB_ORIGINS, ...(webAppUrl === undefined ? [] : [webAppUrl])]),
    ],
    // Only with the stand-ins, so a real Google or Apple ticket never goes
    // to an Expo project someone else names.
    allowExpoGo: !production && mode !== "google" && appleMode !== "apple",
  };
}

export interface PaymentsConfig {
  readonly provider: "none" | "test";
}

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
  readonly adminAppDir: string | undefined;
  readonly errorReporting: ErrorReportingConfig;
  readonly payments: PaymentsConfig;
  /** Whether this process runs the notification worker. */
  readonly worker: boolean;
  readonly push: { readonly accessToken: string | undefined };
  /** Who sends email, if anyone (ADR 0027). */
  readonly email: EmailConfig;
  /** The console's origin for passkeys; undefined turns its sign-in off (ADR 0028). */
  readonly adminOrigin: string | undefined;
  /** The console's temporary password; undefined turns password sign-in off (ADR 0041). */
  readonly adminPassword: string | undefined;
  /** Where meeting point and profile photos are kept, if anywhere (ADRs 0022 and 0033). */
  readonly photos: PhotoStorageConfig;
  /** Google and Apple sign-in (ADR 0034). */
  readonly signIn: SignInConfig;
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

const adminOriginSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  ADMIN_ORIGIN: originSchema.optional(),
});

function adminOriginOf(env: z.infer<typeof adminOriginSchema>): string | undefined {
  return (
    env.ADMIN_ORIGIN ??
    (env.NODE_ENV === "production" ? undefined : `http://localhost:${String(env.PORT)}`)
  );
}

/**
 * The console's origin alone, for the `operator` command: ADMIN_ORIGIN, or
 * the API's own address in development; undefined on a server without it.
 */
export function loadAdminOrigin(
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return adminOriginOf(parseOrThrow(adminOriginSchema, environment));
}

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
    adminAppDir: env.ADMIN_APP_DIR,
    errorReporting,
    payments: {
      provider: env.PAYMENT_PROVIDER ?? (deploymentOf(env) === "production" ? "none" : "test"),
    },
    worker: env.WORKER,
    push: { accessToken: env.EXPO_ACCESS_TOKEN },
    email: emailConfig(env),
    adminOrigin: adminOriginOf(env),
    adminPassword: env.ADMIN_PASSWORD,
    photos: photoStorageConfig(env),
    signIn: signInConfig(env),
  };
}
