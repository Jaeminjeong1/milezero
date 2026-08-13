import { Pool } from "pg";

import {
  loadMigrations,
  resolveMigrationsDirectory,
  runMigrations,
} from "./migrator";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다.");

const pool = new Pool({ connectionString });
try {
  const directory = resolveMigrationsDirectory({
    configuredPath: process.env.MIGRATIONS_DIR,
  });
  await runMigrations(pool, await loadMigrations(directory));
} finally {
  await pool.end();
}
