import { withoutQueryValues } from "@shareride/db";
import { personalDataKeys } from "@shareride/domain";
import { pino, stdSerializers, stdTimeFunctions, type DestinationStream, type Logger } from "pino";

export type { Logger };

/**
 * Keys whose values are personal data or secrets (engineering conventions,
 * "Logging"), shared with error reports. They are replaced wherever they
 * appear, up to three levels deep. Log error codes as `errorCode`, because
 * `code` is the sign-in code.
 */
export const redactedKeys = personalDataKeys;

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
      // Log errors as `err`: a failed query then loses the values it listed.
      serializers: {
        err: (error: unknown) =>
          error instanceof Error ? stdSerializers.err(withoutQueryValues(error)) : error,
      },
    },
    options.destination,
  );
}
