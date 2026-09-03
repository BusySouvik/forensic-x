import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";
import { env, PROJECT_ROOT } from "../config/env";

async function run() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);

  await migrate(db, { migrationsFolder: path.join(PROJECT_ROOT, "drizzle") });
  await migrationClient.end({ timeout: 5 });
  console.log("Migrations complete.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
