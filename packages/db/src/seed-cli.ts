// Adds draft legal documents to DATABASE_URL for local development
// (`pnpm --filter @shareride/db seed`). Never run against production.
import { connectDatabase } from "./index.ts";
import { seedDraftLegalDocuments } from "./seed.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}
if (process.env["NODE_ENV"] === "production") {
  process.stderr.write("The seed adds draft documents and is not for production.\n");
  process.exit(1);
}

const connection = connectDatabase(url, { maxConnections: 1, applicationName: "shareride-seed" });
try {
  await seedDraftLegalDocuments(connection.db, new Date());
  process.stdout.write("Draft legal documents are in place.\n");
} finally {
  await connection.close();
}
