import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_LOCK_ID = 6_453_761_260;

export type Migration = {
  id: string;
  sql: string;
};

export function resolveMigrationsDirectory(
  options: {
    configuredPath?: string;
    moduleUrl?: string;
    exists?: (path: string) => boolean;
  } = {},
): string {
  const moduleUrl = options.moduleUrl ?? import.meta.url;
  const exists = options.exists ?? existsSync;
  const candidates = [
    options.configuredPath,
    fileURLToPath(new URL("../migrations", moduleUrl)),
    fileURLToPath(new URL("../../migrations", moduleUrl)),
  ];
  const directory = candidates.find(
    (path): path is string => Boolean(path && exists(path)),
  );
  if (!directory) throw new Error("PostgreSQL migration 디렉터리를 찾지 못했습니다.");
  return directory;
}

type MigrationClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  release(): void;
};

type MigrationPool = {
  connect(): Promise<MigrationClient>;
};

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    filenames.map(async (filename) => ({
      id: basename(filename, ".sql"),
      sql: await readFile(join(directory, filename), "utf8"),
    })),
  );
}

export async function runMigrations(
  pool: MigrationPool,
  migrations: Migration[],
): Promise<void> {
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    locked = true;
    await client.query(`create table if not exists milezero_schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )`);

    for (const migration of migrations) {
      const applied = await client.query<{ applied: boolean }>(
        "select exists(select 1 from milezero_schema_migrations where id = $1) as applied",
        [migration.id],
      );
      if (applied.rows[0]?.applied) continue;

      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query(
          "insert into milezero_schema_migrations(id) values ($1)",
          [migration.id],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    if (locked) {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    }
    client.release();
  }
}
