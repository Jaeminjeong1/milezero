# Railway PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase RPC persistence with a Railway PostgreSQL connection driven by `DATABASE_URL`, including automatic schema migrations before the web server starts.

**Architecture:** Preserve the existing PostgreSQL JSON function contract and `KnowledgeStore` interface, but call the functions through a `pg.Pool`. A small migration runner applies ordered SQL files under an advisory lock and records completed versions before Fastify starts.

**Tech Stack:** TypeScript, Node.js 22, `pg`, PostgreSQL/PLpgSQL, Vitest, PGlite, Docker, Railway

**Spec:** `docs/superpowers/specs/2026-08-13-railway-postgresql-design.md`

## Global Constraints

- Preserve the existing `KnowledgeStore` interface and API behavior.
- Use only `DATABASE_URL` for production database configuration.
- Preserve the existing transaction, idempotency, validation, point, and claim-status semantics.
- Do not modify the in-progress frontend GPS journey files.
- Run schema migrations before starting Fastify; abort startup on migration failure.
- Remove Supabase-only roles, grants, RLS, environment variables, and packages.

---

### Task 1: PostgreSQL knowledge store

**Files:**
- Create: `backend/src/storage/postgres-store.ts`
- Create: `backend/src/storage/postgres-store.test.ts`
- Delete: `backend/src/storage/supabase-store.ts`
- Delete: `backend/src/storage/supabase-store.test.ts`
- Modify: `backend/src/server/dependencies.ts`
- Modify: `backend/src/server/dependencies.test.ts`
- Modify: `backend/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: existing `KnowledgeStore`, `CommitContributionInput`, and stored domain types from `backend/src/storage/contracts.ts`.
- Produces: `PostgresKnowledgeStore` and `createPostgresKnowledgeStoreFromEnv(env): PostgresKnowledgeStore`.

- [ ] **Step 1: Write failing adapter and configuration tests**

```ts
const query = vi.fn(async () => ({ rows: [{ data: claimRow }] }));
const store = new PostgresKnowledgeStore({ query });
expect(await store.getClaim("claim-1")).toMatchObject({ id: "claim-1" });
expect(query).toHaveBeenCalledWith(
  "select public.mz_get_claim($1::jsonb) as data",
  [JSON.stringify({ claim_id: "claim-1" })],
);
expect(() => createPostgresKnowledgeStoreFromEnv({})).toThrow(/DATABASE_URL/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm --filter @milezero/backend test -- src/storage/postgres-store.test.ts src/server/dependencies.test.ts`

Expected: FAIL because `postgres-store.ts` does not exist and production dependencies still use Supabase.

- [ ] **Step 3: Implement the parameterized PostgreSQL adapter**

```ts
const RpcSql = {
  mz_get_claim: "select public.mz_get_claim($1::jsonb) as data",
  // Every allowed function is listed explicitly; no user-controlled identifier is interpolated.
} as const;

type QueryClient = {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

private async call(name: keyof typeof RpcSql, payload: object) {
  const result = await this.client.query<{ data: unknown }>(RpcSql[name], [
    JSON.stringify(payload),
  ]);
  return result.rows[0]?.data ?? null;
}
```

Replace `@supabase/supabase-js` with `pg` and `@types/pg`, and update production dependency wiring to call `createPostgresKnowledgeStoreFromEnv`.

- [ ] **Step 4: Run focused and backend tests and verify GREEN**

Run: `corepack pnpm --filter @milezero/backend test -- src/storage/postgres-store.test.ts src/server/dependencies.test.ts`

Expected: PASS with SQL binding, row mapping, missing `DATABASE_URL`, and DB-error propagation covered.

### Task 2: Railway-compatible schema and migration runner

**Files:**
- Create: `backend/migrations/001_initial.sql`
- Create: `backend/src/storage/migrator.ts`
- Create: `backend/src/storage/migrator.test.ts`
- Create: `backend/src/storage/migrate.ts`
- Modify: `backend/src/storage/migration.test.ts`
- Delete: `backend/supabase/migrations/202608130001_milezero_pipeline.sql`

**Interfaces:**
- Consumes: ordered `.sql` migration files and a `pg.Pool`-compatible `connect()` method.
- Produces: `loadMigrations(directory): Promise<Migration[]>`, `runMigrations(pool, migrations): Promise<void>`, and a `migrate` executable entry point.

- [ ] **Step 1: Write failing migration-runner tests**

```ts
await runMigrations(pool, [{ id: "001_initial", sql: "create table sample(id int)" }]);
await runMigrations(pool, [{ id: "001_initial", sql: "create table sample(id int)" }]);
expect(executedSql.filter((sql) => sql.includes("create table sample"))).toHaveLength(1);
expect(released).toBe(true);
```

Also update the PGlite schema test to load `backend/migrations/001_initial.sql` without creating Supabase roles, and assert the application tables do not enable RLS.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm --filter @milezero/backend test -- src/storage/migrator.test.ts src/storage/migration.test.ts`

Expected: FAIL because the runner and Railway migration file do not exist.

- [ ] **Step 3: Implement the ledger, advisory lock, and transaction flow**

```ts
await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
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
    await client.query("insert into milezero_schema_migrations(id) values ($1)", [migration.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
```

Always release the advisory lock and client in `finally`. The CLI reads `DATABASE_URL`, resolves the migration directory, applies migrations, closes the pool, and exits non-zero on error.

- [ ] **Step 4: Run focused and backend tests and verify GREEN**

Run: `corepack pnpm --filter @milezero/backend test -- src/storage/migrator.test.ts src/storage/migration.test.ts`

Expected: PASS for first application, repeat skip, rollback, Railway schema functions, and contribution idempotency.

### Task 3: Deployment startup and operator documentation

**Files:**
- Modify: `backend/package.json`
- Modify: `Dockerfile`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: compiled `backend/dist/migrate.js`, `backend/migrations`, and Railway `DATABASE_URL`.
- Produces: a container startup sequence that migrates before starting `backend/dist/main.js`.

- [ ] **Step 1: Add a deployment assertion that initially fails**

Extend `backend/src/server/dependencies.test.ts` to assert production construction with a fake Gemini gateway rejects missing `DATABASE_URL` with a `DATABASE_URL` message. Verify `.env.example` no longer contains Supabase variable names using the final repository scan in Step 4.

- [ ] **Step 2: Run the dependency test and verify RED**

Run: `corepack pnpm --filter @milezero/backend test -- src/server/dependencies.test.ts`

Expected: FAIL until Task 1 wiring and the production environment contract are complete.

- [ ] **Step 3: Wire build and Docker startup**

```json
{
  "scripts": {
    "build": "tsup src/server/main.ts src/storage/migrate.ts --format esm --platform node --target node22 --out-dir dist --clean",
    "db:migrate": "tsx src/storage/migrate.ts"
  }
}
```

Copy `backend/migrations` into the runtime image, set `MIGRATIONS_DIR=/app/backend/migrations`, and run `node backend/dist/migrate.js` before `node backend/dist/main.js`. Replace Supabase variables and setup instructions with `DATABASE_URL=${{Postgres.DATABASE_URL}}` and Railway database-service steps.

- [ ] **Step 4: Verify configuration and documentation**

Run: `rg -n "SUPABASE|Supabase|supabase" --glob '!pnpm-lock.yaml' --glob '!docs/superpowers/**' .`

Expected: no production code, active migration, README, or `.env.example` references remain.

- [ ] **Step 5: Run full verification**

Run: `corepack pnpm test`

Expected: all backend and frontend tests pass.

Run: `corepack pnpm typecheck`

Expected: both packages pass TypeScript checking.

Run: `corepack pnpm build`

Expected: Vite frontend and both backend entry points build successfully.

Run: `git diff --check`

Expected: no whitespace errors.
