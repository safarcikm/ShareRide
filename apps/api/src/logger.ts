import { pino, stdTimeFunctions, type DestinationStream, type Logger } from "pino";

export type { Logger };

/**
 * Keys whose values are personal data or secrets (engineering conventions,
 * "Logging"). They are replaced wherever they appear, up to three levels deep.
 * Log error codes as `errorCode`, because `code` is the sign-in code.
 */
export const redactedKeys = [
  "phone",
  "phoneNumber",
  "phoneE164",
  "code",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "password",
  "email",
  "firstName",
  "lastName",
  "about",
  "latitude",
  "longitude",
] as const;

const redactPaths = redactedKeys.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

export interface LoggerOptions {
  readonly level: string;
  /** Where log lines go; standard output when left out. */
  readonly destination?: DestinationStream;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level,
      base: undefined,
      timestamp: stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: redactPaths, censor: "[redacted]" },
    },
    options.destination,
  );
}
