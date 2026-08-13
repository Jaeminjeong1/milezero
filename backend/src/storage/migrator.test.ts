import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadMigrations,
  resolveMigrationsDirectory,
  runMigrations,
} from "./migrator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true }),
    ),
  );
});

describe("PostgreSQL migration runner", () => {
  it("배포에서 지정한 migration 디렉터리를 우선 사용한다", () => {
    const directory = resolveMigrationsDirectory({
      configuredPath: "/app/backend/migrations",
      exists: (path) => path === "/app/backend/migrations",
    });

    expect(directory).toBe("/app/backend/migrations");
  });

  it("SQL migration을 파일명 순서로 불러오고 다른 파일은 무시한다", async () => {
    const directory = await mkdtemp(join(tmpdir(), "milezero-migrations-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "002_second.sql"), "select 2;");
    await writeFile(join(directory, "001_first.sql"), "select 1;");
    await writeFile(join(directory, "README.md"), "ignored");

    const migrations = await loadMigrations(directory);

    expect(migrations).toEqual([
      { id: "001_first", sql: "select 1;" },
      { id: "002_second", sql: "select 2;" },
    ]);
  });

  it(
    "이미 적용한 migration은 다시 실행하지 않는다",
    async () => {
      const database = new PGlite();
      const pool = pglitePool(database);
      const migration = {
        id: "001_sample",
        sql: "create table migration_sample(id integer primary key);",
      };

      await runMigrations(pool, [migration]);
      await runMigrations(pool, [migration]);

      const ledger = await database.query<{ id: string }>(
        "select id from milezero_schema_migrations order by id",
      );
      expect(ledger.rows).toEqual([{ id: "001_sample" }]);
      await database.close();
    },
    30_000,
  );

  it(
    "실패한 migration과 ledger 기록을 함께 rollback한다",
    async () => {
      const database = new PGlite();
      const pool = pglitePool(database);

      await expect(
        runMigrations(pool, [
          {
            id: "001_broken",
            sql: "create table should_rollback(id integer); select 1 / 0;",
          },
        ]),
      ).rejects.toThrow();

      const table = await database.query<{ exists: boolean }>(
        "select to_regclass('public.should_rollback') is not null as exists",
      );
      const ledger = await database.query<{ count: number }>(
        "select count(*)::int as count from milezero_schema_migrations",
      );
      expect(table.rows[0]?.exists).toBe(false);
      expect(ledger.rows[0]?.count).toBe(0);
      await database.close();
    },
    30_000,
  );

  it("unlock이 실패해도 client를 반드시 반환한다", async () => {
    const release = vi.fn();
    const client = {
      query: async <T extends Record<string, unknown>>(text: string) => {
        if (text.includes("pg_advisory_unlock")) {
          throw new Error("unlock failed");
        }
        return { rows: [] as T[] };
      },
      release,
    };

    await expect(
      runMigrations({ connect: async () => client }, []),
    ).rejects.toThrow("unlock failed");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rollback과 unlock이 실패해도 최초 migration 오류를 보존한다", async () => {
    const release = vi.fn();
    const client = {
      query: async <T extends Record<string, unknown>>(text: string) => {
        if (text.includes("select exists")) {
          return { rows: [{ applied: false }] as unknown as T[] };
        }
        if (text === "broken migration") {
          throw new Error("migration failed");
        }
        if (text === "rollback") throw new Error("rollback failed");
        if (text.includes("pg_advisory_unlock")) {
          throw new Error("unlock failed");
        }
        return { rows: [] as T[] };
      },
      release,
    };

    await expect(
      runMigrations({ connect: async () => client }, [
        { id: "001_broken", sql: "broken migration" },
      ]),
    ).rejects.toThrow("migration failed");
    expect(release).toHaveBeenCalledOnce();
  });
});

function pglitePool(database: PGlite) {
  return {
    connect: async () => ({
      query: async <T extends Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) => database.query<T>(text, values),
      release: () => undefined,
    }),
  };
}
