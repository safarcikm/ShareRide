/** Whether a database error, or one it was caused by, is the given unique constraint refusing a second row. */
export function uniqueViolation(error: unknown, constraint: string): boolean {
  for (let cause = error; typeof cause === "object" && cause !== null;) {
    const fields = cause as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (fields.code === "23505" && fields.constraint === constraint) return true;
    cause = fields.cause;
  }
  return false;
}
