# MileZero Workspace Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프런트엔드와 백엔드를 독립 workspace 패키지로 분리하면서 단일 URL 배포와 기존 기능을 보존한다.

**Architecture:** 루트 pnpm workspace가 `frontend`와 `backend`를 오케스트레이션한다. 개발 시 Vite가 Fastify로 프록시하고, 프로덕션에서는 Fastify가 `frontend/dist`를 제공한다.

**Tech Stack:** Node.js 22, Corepack, pnpm 11.19, TypeScript, React 19, Vite, Fastify, Vitest, tsup, Docker, Railway

**Spec:** `docs/superpowers/specs/2026-08-13-workspace-separation-design.md`

## Global Constraints

- 표준 실행기는 전역 pnpm이 아니라 `corepack pnpm`이다.
- 프런트엔드는 백엔드 구현 파일을 직접 import하지 않는다.
- 프로덕션 배포 URL은 하나이며 `/v1/*`, `/health`, `/ready`는 API가 처리한다.
- 기존 개인정보 제거와 데모 QA 동작을 변경하지 않는다.
- 커밋 메시지는 `type: 한국어 요약` 형식을 사용한다.
- 원격 이력 갱신은 `--force-with-lease`로만 수행한다.

---

### Task 1: Workspace 구조 계약과 패키지 분리

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vitest.config.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Move: `src/client/**` → `frontend/src/**`
- Move: `src/{demo,domain,friction,gemini,knowledge,media,pipeline,privacy,questions,server,storage,validation}/**` → `backend/src/**`
- Move: `supabase/**` → `backend/supabase/**`
- Move: `index.html` → `frontend/index.html`
- Move: `vite.config.ts` → `frontend/vite.config.ts`

**Interfaces:**
- Produces: workspace packages `@milezero/backend`, `@milezero/frontend`
- Produces: root commands `dev`, `dev:demo`, `build`, `test`, `typecheck`, `qa:demo`

- [ ] **Step 1: Record the green characterization baseline**

Run: `corepack pnpm test`

Expected: the existing 75 behavior tests pass before any file moves.

- [ ] **Step 2: Move sources and verify the old root runner is RED**

Move the source directories and entry files without changing package configuration, then run `corepack pnpm test`.

Expected: FAIL because the old root Vitest configuration can no longer resolve the moved sources. This proves the existing behavior suite guards the refactor boundary.

- [ ] **Step 3: Create package configs and root orchestration**

The root package delegates commands with exact filters:

```json
{
  "scripts": {
    "dev": "concurrently -k -n api,web -c blue,yellow \"corepack pnpm --filter @milezero/backend dev\" \"corepack pnpm --filter @milezero/frontend dev\"",
    "dev:demo": "concurrently -k -n api,web -c blue,yellow \"corepack pnpm --filter @milezero/backend dev:demo\" \"corepack pnpm --filter @milezero/frontend dev\"",
    "build": "corepack pnpm --filter @milezero/frontend build && corepack pnpm --filter @milezero/backend build",
    "test": "corepack pnpm --filter @milezero/backend test && corepack pnpm --filter @milezero/frontend test",
    "typecheck": "corepack pnpm --filter @milezero/backend typecheck && corepack pnpm --filter @milezero/frontend typecheck",
    "qa:demo": "corepack pnpm --filter @milezero/backend qa:demo"
  }
}
```

Backend aliases resolve `@/*` to `backend/src/*`; frontend aliases resolve `@/*` to `frontend/src/*`. Each manifest receives only its runtime and test dependencies.

- [ ] **Step 4: Install and verify GREEN**

Run: `corepack pnpm install`

Run: `corepack pnpm test`

Expected: all existing backend and frontend tests pass.

- [ ] **Step 5: Verify package independence and commit**

Run: `corepack pnpm --filter @milezero/backend test`

Run: `corepack pnpm --filter @milezero/frontend test`

Expected: each package test suite passes independently.

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml backend frontend
git commit -m "refactor: 프런트엔드와 백엔드 패키지 분리"
```

### Task 2: 단일 URL 런타임과 컨테이너 빌드 보완

**Files:**
- Modify: `backend/src/server/runtime.test.ts`
- Modify: `backend/src/server/runtime.ts`
- Modify: `backend/src/server/server.test.ts`
- Modify: `backend/src/server/server.ts`
- Modify: `Dockerfile`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: `frontend/dist`
- Produces: `resolveClientDirectory(env: NodeJS.ProcessEnv): string`
- Preserves: `/ready`, `/health`, `/v1/*`, SPA fallback

- [ ] **Step 1: Write the failing static-path test**

```ts
it("workspace 루트의 frontend/dist를 기본 정적 경로로 사용한다", () => {
  const directory = resolveClientDirectory({});
  expect(directory.endsWith("frontend/dist")).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `corepack pnpm --filter @milezero/backend test -- src/server/runtime.test.ts`

Expected: FAIL because the previous path points to the monolithic `dist/client` layout.

- [ ] **Step 3: Implement workspace-aware static path and Docker stages**

`resolveClientDirectory` first honors `CLIENT_DIST_DIR`; otherwise it resolves the packaged server location to the workspace's `frontend/dist`. Docker copies package manifests before install, runs the root build, and copies only backend runtime output plus frontend static output into the runner.

- [ ] **Step 4: Verify server tests and production build**

Run: `corepack pnpm --filter @milezero/backend test -- src/server/runtime.test.ts src/server/server.test.ts`

Run: `corepack pnpm build`

Expected: tests PASS and both `backend/dist/main.js` and `frontend/dist/index.html` exist.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server Dockerfile .dockerignore
git commit -m "chore: 분리된 패키지의 단일 URL 배포 구성"
```

### Task 3: Corepack 실행 문서와 최종 QA

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-08-13-milezero-frontend-design.md`
- Modify: `docs/superpowers/plans/2026-08-13-milezero-frontend.md`

**Interfaces:**
- Documents: root and package-specific Corepack commands
- Documents: `backend/supabase/migrations` location

- [ ] **Step 1: Update documentation references**

Document one-time activation and no-activation fallback:

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
corepack pnpm install
corepack pnpm dev:demo
```

Replace source paths in historical implementation docs with current `frontend/src` and `backend/src` paths where they describe the live repository.

- [ ] **Step 2: Verify every documented command against the workspace**

Run the exact install, root quality, package-specific development, and production start commands documented in README. Check exit codes and observable server responses rather than testing prose strings.

- [ ] **Step 3: Run all quality gates**

Run in order:

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm qa:demo
```

Expected: all commands exit 0, the demo reports `raw phone persisted: false`, and final reporter points equal 35.

- [ ] **Step 4: Smoke test the production server**

Start `MILEZERO_MODE=demo PORT=3100 corepack pnpm --filter @milezero/backend start`, then assert:

```text
GET /          -> 200 text/html
GET /ready     -> 200 application/json with status=ready
GET /v1/missing -> 404 application/json
```

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example docs
git commit -m "docs: 분리된 개발 환경 실행 방법 정리"
```

### Task 4: 전체 커밋 메시지 재작성과 원격 갱신

**Files:**
- No working tree files
- Create local backup ref: `refs/backup/main-before-conventional-history`

**Interfaces:**
- Consumes: complete verified `main` history
- Produces: same trees and metadata with Conventional Commit messages

- [ ] **Step 1: Fetch and record remote lease**

```bash
git fetch origin main
git rev-parse origin/main
git update-ref refs/backup/main-before-conventional-history main
```

Record the exact `origin/main` hash as `REMOTE_MAIN_BEFORE_REWRITE`.

- [ ] **Step 2: Rewrite messages only**

Use a deterministic old-subject → new-subject map and `git commit-tree` so every rewritten commit preserves its tree, parent topology, author, committer, and timestamps. Reject any commit without an explicit mapping. Validate every subject with:

```bash
git log --format=%s | rg -v '^(feat|fix|docs|test|chore|refactor): .+'
```

Expected: no output.

- [ ] **Step 3: Re-run verification on rewritten history**

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm qa:demo
git diff refs/backup/main-before-conventional-history..main --exit-code
```

Expected: quality gates exit 0 and the history rewrite has no tree diff.

- [ ] **Step 4: Push with an explicit lease**

```bash
git push --force-with-lease=main:$REMOTE_MAIN_BEFORE_REWRITE origin main
git fetch origin main
test "$(git rev-parse main)" = "$(git rev-parse origin/main)"
```

Expected: push succeeds and local/remote hashes match.
