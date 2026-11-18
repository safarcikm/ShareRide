import { readFileSync } from "node:fs";

/**
 * The entries in an outbox file the test API appends to, one JSON line each.
 * A line still being written has no newline yet, so only the complete lines
 * are read; the poll that calls this reads the file again.
 */
export function readOutbox<T>(file: string): T[] {
  const written = readFileSync(file, "utf8");
  return written
    .slice(0, written.lastIndexOf("\n") + 1)
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as T);
}
