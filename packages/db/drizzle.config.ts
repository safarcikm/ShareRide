import { defineConfig } from "drizzle-kit";

// drizzle-kit only generates migration files from the schema; migrations are
// applied by src/migrate.ts, never by drizzle-kit push.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
});
