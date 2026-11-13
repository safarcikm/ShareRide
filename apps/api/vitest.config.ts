import { defineConfig } from "vitest/config";

// Local runs read TEST_DATABASE_URL from the repository's .env; CI sets it.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file.
}

export default defineConfig({
  test: {
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
  },
});
