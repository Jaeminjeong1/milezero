# MileZero Hackathon MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GPS 룰로 배송 마찰을 감지하고, Gemini가 기사에게 질문하여 비식별 현장 지식을 추출하며, 다른 기사의 검증을 거친 가이드를 다음 배송인에게 제공하는 배포 가능한 웹앱을 만든다.

**Architecture:** Next.js PWA가 열린 동안 GPS를 브라우저 메모리에서 분석하고 원본 좌표 대신 집계된 마찰 특징만 서버에 전송한다. 같은 Next.js 서비스의 Route Handler가 Gemini API의 질문 생성·지식 추출·의미 비교·가이드 생성을 오케스트레이션하며, Supabase PostgreSQL/PostGIS는 장소·후보 주장·검증 근거·가이드·포인트를 저장한다. 웹과 API를 하나의 OCI 컨테이너로 만들어 Railway에 우선 배포하고, 필요하면 같은 이미지를 다른 컨테이너 호스트로 옮긴다.

**Tech Stack:** Next.js App Router, TypeScript, React, Tailwind CSS, Vitest, Testing Library, Playwright, Zod, Google GenAI SDK (`@google/genai`), Supabase (`@supabase/supabase-js`), PostgreSQL/PostGIS, Docker, Railway

**Spec:** `README.md` 및 이 대화에서 확정한 LLM 중심 파이프라인

## Global Constraints

- GPS 이상 탐지는 ML 없이 Rule Engine으로 구현한다.
- 브라우저는 배송 화면이 열린 동안에만 `navigator.geolocation.watchPosition()`으로 GPS를 수집한다.
- 원본 GPS 궤적은 서버와 데이터베이스에 저장하지 않고 집계 특징만 전송한다.
- 기사에게 책임을 묻거나 배송지 문제를 단정하는 질문을 생성하지 않는다.
- 질문 선택지에는 항상 `불편하지 않았어요`가 포함되어야 한다.
- 기사 입력에서 개인정보가 발견돼도 재질문하지 않고 해당 부분만 마스킹한다.
- 이름, 전화번호, 이메일, 동호수, 출입 비밀번호, 얼굴, 차량번호 및 사진 EXIF를 저장하지 않는다.
- 원본 음성·사진은 Gemini 요청 처리 중 임시 메모리에서만 사용하고 오브젝트 스토리지와 애플리케이션 로그에 기록하지 않는다.
- Gemini는 사실을 확정하지 않고 질문 생성, 후보 주장 추출, 기존 주장과의 의미 비교, 검증된 주장 요약만 담당한다.
- 지식의 최종 상태와 신뢰도는 결정론적 Rule Engine이 계산한다.
- 유효한 제보 등록 즉시 기본 포인트를 지급하고, 독립 검증 또는 `도움됐어요`가 발생하면 추가 포인트를 지급한다.
- MVP에서는 벡터 데이터베이스, RAG, 모델 파인튜닝, 별도 ML 모델 서빙을 도입하지 않는다.
- Gemini API 키와 Supabase service role 키는 서버 환경변수에서만 읽는다.
- 실제 GPS 권한이 없거나 발표 장소에서 이동할 수 없는 경우를 위해 동일한 파이프라인을 통과하는 결정론적 데모 시뮬레이터를 제공한다.
- 해커톤 데모의 기사 A/B는 개인정보가 아닌 seed 가명이며, 외부 파일럿 전에 Supabase Auth와 서버 측 사용자 바인딩을 추가한다.
- 해커톤 제출본은 프론트엔드와 API를 하나의 Next.js 서비스·동일 출처(origin)로 배포해 CORS와 이중 배포를 피한다.
- 배포 대상은 Railway를 기본으로 하되 Docker 표준 이미지로 만들어 다른 컨테이너 호스트에서도 코드 변경 없이 실행한다.

---

## Planned File Structure

```text
milezero/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── feedback/route.ts
│   │   │   ├── guides/route.ts
│   │   │   ├── questions/route.ts
│   │   │   └── reports/route.ts
│   │   ├── contribute/page.tsx
│   │   ├── delivery/page.tsx
│   │   ├── guide/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── contribution-form.tsx
│   │   ├── delivery-tracker.tsx
│   │   ├── friction-question.tsx
│   │   ├── guide-card.tsx
│   │   └── processing-timeline.tsx
│   ├── features/
│   │   ├── friction/
│   │   │   ├── detector.test.ts
│   │   │   ├── detector.ts
│   │   │   ├── simulator.ts
│   │   │   └── types.ts
│   │   ├── guides/
│   │   │   ├── composer.test.ts
│   │   │   └── composer.ts
│   │   ├── knowledge/
│   │   │   ├── extractor.test.ts
│   │   │   ├── extractor.ts
│   │   │   ├── matcher.test.ts
│   │   │   └── matcher.ts
│   │   ├── privacy/
│   │   │   ├── sanitizer.test.ts
│   │   │   └── sanitizer.ts
│   │   ├── questions/
│   │   │   ├── planner.test.ts
│   │   │   └── planner.ts
│   │   ├── rewards/
│   │   │   ├── service.test.ts
│   │   │   └── service.ts
│   │   └── validation/
│   │       ├── confidence.test.ts
│   │       └── confidence.ts
│   ├── lib/
│   │   ├── env.ts
│   │   ├── gemini/client.ts
│   │   ├── gemini/types.ts
│   │   └── supabase/
│   │       └── admin.ts
│   └── test/setup.ts
├── supabase/
│   ├── migrations/202608130001_initial_schema.sql
│   └── seed.sql
├── tests/e2e/milezero-flow.spec.ts
├── .env.example
├── .dockerignore
├── Dockerfile
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── railway.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Task 1: Next.js 애플리케이션과 테스트 기반 구성

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/test/setup.ts`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Test: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: Next.js App Router 애플리케이션, `pnpm test`, `pnpm dev`, `pnpm build` 명령

- [ ] **Step 1: Next.js 프로젝트와 테스트 의존성을 초기화한다**

Run:

```bash
pnpm init
pnpm add next@latest react@latest react-dom@latest zod @google/genai @supabase/supabase-js server-only
pnpm add -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss eslint eslint-config-next vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react @playwright/test supabase
```

Then set `package.json` scripts to:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest"
  }
}
```

Expected: 기존 `README.md`를 보존한 채 `package.json`과 `pnpm-lock.yaml`이 생성되고 설치가 성공한다.

- [ ] **Step 2: 첫 화면의 실패 테스트를 작성한다**

```tsx
// src/app/page.test.tsx
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("shows the MileZero product promise", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "도착 이후를 안내하는 배송 지식" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "배송 시작" })).toHaveAttribute(
      "href",
      "/delivery",
    );
  });
});
```

- [ ] **Step 3: 테스트를 실행해 실패를 확인한다**

Run: `pnpm vitest run src/app/page.test.tsx`

Expected: 문구 또는 테스트 설정이 없어 FAIL한다.

- [ ] **Step 4: 테스트 설정과 최소 홈 화면을 구현한다**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

```js
// postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } };
```

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
```

```ts
// vitest.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

```ts
// src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

```css
/* src/app/globals.css */
@import "tailwindcss";
```

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MileZero",
  description: "기사의 현장 경험을 다음 배송의 행동 가이드로 바꿉니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <p>MileZero</p>
      <h1>도착 이후를 안내하는 배송 지식</h1>
      <p>기사의 현장 경험을 다음 배송의 행동 가이드로 바꿉니다.</p>
      <Link href="/delivery">배송 시작</Link>
    </main>
  );
}
```

- [ ] **Step 5: 환경변수 예시를 추가한다**

```dotenv
# .env.example
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
```

- [ ] **Step 6: 단위 테스트와 빌드를 검증한다**

Run:

```bash
pnpm vitest run src/app/page.test.tsx
pnpm build
```

Expected: 테스트 PASS, 프로덕션 빌드 성공.

- [ ] **Step 7: 커밋한다**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs src vitest.config.ts .env.example
git commit -m "chore: scaffold MileZero web app"
```

### Task 2: 도메인 스키마와 개인정보 분리 저장소 구성

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/gemini/types.ts`
- Create: `supabase/migrations/202608130001_initial_schema.sql`
- Create: `supabase/seed.sql`
- Test: `src/lib/gemini/types.test.ts`

**Interfaces:**
- Consumes: Task 1의 Zod와 Supabase SDK
- Produces: `FrictionEventSchema`, `QuestionPlanSchema`, `KnowledgeExtractionSchema`, `GuideSchema`, Supabase 테이블

- [ ] **Step 1: 도메인 스키마 실패 테스트를 작성한다**

```ts
// src/lib/gemini/types.test.ts
import { KnowledgeExtractionSchema, QuestionPlanSchema } from "./types";

describe("Gemini domain schemas", () => {
  it("rejects a blaming question", () => {
    expect(() =>
      QuestionPlanSchema.parse({
        shouldAsk: true,
        frictionType: "PARKING_UNLOADING",
        question: "왜 잘못된 곳에 주차했나요?",
        choices: ["불편하지 않았어요", "정차 위치가 없었어요"],
      }),
    ).toThrow();
  });

  it("accepts atomic knowledge claims", () => {
    const result = KnowledgeExtractionSchema.parse({
      sanitizedSummary: "1톤 차량은 후문으로 진입해야 합니다.",
      removedPiiTypes: ["PHONE"],
      claims: [
        {
          type: "ENTRANCE_RECOMMENDATION",
          value: "후문 진입",
          vehicleType: "1TON",
          timeCondition: null,
          evidence: "1톤차는 후문으로 가야 해요",
        },
      ],
    });
    expect(result.claims).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 테스트를 실행해 스키마 부재 실패를 확인한다**

Run: `pnpm vitest run src/lib/gemini/types.test.ts`

Expected: 모듈을 찾을 수 없어 FAIL한다.

- [ ] **Step 3: 공용 Zod 스키마를 구현한다**

```ts
// src/lib/gemini/types.ts
import { z } from "zod";

const blamingPattern = /(왜.*잘못|기사.*책임|실수했|헤맸)/;

export const FrictionEventSchema = z.object({
  sessionId: z.string().uuid(),
  placeId: z.string().uuid(),
  vehicleType: z.enum(["BIKE", "CAR", "VAN", "1TON"]),
  frictionTypes: z.array(
    z.enum(["LONG_DWELL", "REPEATED_STOPS", "REPEATED_MOVEMENT"]),
  ),
  features: z.object({
    dwellSeconds: z.number().nonnegative(),
    stopCount: z.number().int().nonnegative(),
    travelMeters: z.number().nonnegative(),
    displacementMeters: z.number().nonnegative(),
  }),
});

export const QuestionPlanSchema = z
  .object({
    shouldAsk: z.boolean(),
    frictionType: z.enum([
      "ENTRANCE",
      "PARKING_UNLOADING",
      "VEHICLE_RESTRICTION",
      "ACCESS_REGISTRATION",
      "ELEVATOR",
      "INTERNAL_NAVIGATION",
      "OTHER",
    ]),
    question: z.string().min(1).max(120),
    choices: z.array(z.string().min(1).max(40)).min(2).max(8),
  })
  .superRefine((value, context) => {
    if (blamingPattern.test(value.question)) {
      context.addIssue({ code: "custom", message: "Question blames the driver" });
    }
    if (!value.choices.includes("불편하지 않았어요")) {
      context.addIssue({ code: "custom", message: "Neutral choice is required" });
    }
  });

export const ClaimSchema = z.object({
  type: z.enum([
    "ENTRANCE_RECOMMENDATION",
    "UNLOADING_LOCATION",
    "VEHICLE_RESTRICTION",
    "ACCESS_PROCEDURE",
    "ELEVATOR_GUIDE",
    "INTERNAL_ROUTE",
  ]),
  value: z.string().min(1).max(240),
  vehicleType: z.enum(["ALL", "BIKE", "CAR", "VAN", "1TON"]),
  timeCondition: z.string().max(80).nullable(),
  evidence: z.string().min(1).max(240),
});

export const KnowledgeExtractionSchema = z.object({
  sanitizedSummary: z.string().max(500),
  removedPiiTypes: z.array(
    z.enum(["NAME", "PHONE", "EMAIL", "UNIT", "PASSWORD", "FACE", "PLATE"]),
  ),
  claims: z.array(ClaimSchema).max(8),
});

export type FrictionEvent = z.infer<typeof FrictionEventSchema>;
export type QuestionPlan = z.infer<typeof QuestionPlanSchema>;
export type KnowledgeExtraction = z.infer<typeof KnowledgeExtractionSchema>;
```

- [ ] **Step 4: 서버·브라우저 환경변수와 Supabase 클라이언트 경계를 구현한다**

```ts
// src/lib/env.ts
import { z } from "zod";

const ServerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
});

export function getServerEnv() {
  return ServerEnvSchema.parse(process.env);
}
```

```ts
// src/lib/supabase/admin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

export function createAdminSupabase() {
  const env = getServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

브라우저용 Supabase client는 만들지 않는다. 모든 DB 접근은 검증된 Next.js Route Handler를 거치며 service role key는 서버에서만 사용한다.

- [ ] **Step 5: 데이터베이스 마이그레이션을 작성한다**

```sql
-- supabase/migrations/202608130001_initial_schema.sql
create extension if not exists postgis;
create extension if not exists pgcrypto;

create type claim_status as enum ('CANDIDATE', 'VERIFIED', 'CONFLICT', 'STALE');
create type evidence_verdict as enum ('SUPPORTS', 'CONTRADICTS', 'HELPFUL');

create table driver_profiles (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  created_at timestamptz not null default now()
);

create table places (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  location geography(point, 4326) not null,
  created_at timestamptz not null default now()
);
create index places_location_idx on places using gist (location);

create table delivery_sessions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id),
  driver_profile_id uuid not null references driver_profiles(id),
  vehicle_type text not null check (vehicle_type in ('BIKE', 'CAR', 'VAN', '1TON')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table friction_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references delivery_sessions(id),
  friction_types text[] not null,
  aggregate_features jsonb not null,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references delivery_sessions(id),
  input_mode text not null check (input_mode in ('CHOICE', 'TEXT', 'VOICE', 'PHOTO')),
  sanitized_summary text not null,
  removed_pii_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id),
  report_id uuid not null references reports(id),
  claim_type text not null,
  value text not null,
  vehicle_type text not null,
  time_condition text,
  sanitized_evidence text not null,
  status claim_status not null default 'CANDIDATE',
  confidence numeric(4, 3) not null default 0.350,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index claims_place_status_idx on claims(place_id, status);

create table claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id),
  driver_profile_id uuid not null references driver_profiles(id),
  verdict evidence_verdict not null,
  source text not null check (source in ('REPORT', 'GPS', 'GUIDE_FEEDBACK')),
  created_at timestamptz not null default now(),
  unique(claim_id, driver_profile_id, verdict, source)
);

create table guides (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id),
  vehicle_type text not null,
  content jsonb not null,
  source_claim_ids uuid[] not null,
  updated_at timestamptz not null default now(),
  unique(place_id, vehicle_type)
);

create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  driver_profile_id uuid not null references driver_profiles(id),
  report_id uuid references reports(id),
  claim_id uuid references claims(id),
  reason text not null check (reason in ('REPORT_CREATED', 'CLAIM_VERIFIED', 'GUIDE_HELPFUL')),
  points integer not null check (points > 0),
  created_at timestamptz not null default now()
);

alter table driver_profiles enable row level security;
alter table places enable row level security;
alter table delivery_sessions enable row level security;
alter table friction_events enable row level security;
alter table reports enable row level security;
alter table claims enable row level security;
alter table claim_evidence enable row level security;
alter table guides enable row level security;
alter table points_ledger enable row level security;

-- MVP는 공개 anon/authenticated 정책을 만들지 않는다. 브라우저는 Next.js API만 호출하고,
-- 서버의 service role만 입력 검증 후 DB에 접근한다.
```

- [ ] **Step 6: 데모 장소와 가명 기사를 seed한다**

```sql
-- supabase/seed.sql
insert into driver_profiles (id, alias) values
  ('10000000-0000-0000-0000-000000000001', '현장기사 A'),
  ('10000000-0000-0000-0000-000000000002', '현장기사 B');

insert into places (id, display_name, location) values (
  '20000000-0000-0000-0000-000000000001',
  'MZ 타워',
  st_setsrid(st_makepoint(127.0276, 37.4979), 4326)::geography
);
```

- [ ] **Step 7: 스키마 테스트와 로컬 마이그레이션을 검증한다**

Run:

```bash
pnpm vitest run src/lib/gemini/types.test.ts
pnpm exec supabase db reset
```

Expected: 스키마 테스트 PASS, 모든 테이블과 seed 데이터 생성 성공.

- [ ] **Step 8: 커밋한다**

```bash
git add src/lib supabase
git commit -m "feat: define privacy-safe knowledge schema"
```

### Task 3: 브라우저 GPS Rule Engine과 데모 시뮬레이터 구현

**Files:**
- Create: `src/features/friction/types.ts`
- Create: `src/features/friction/detector.ts`
- Create: `src/features/friction/simulator.ts`
- Create: `src/features/friction/detector.test.ts`

**Interfaces:**
- Consumes: 브라우저에서 얻은 `GpsSample[]`
- Produces: `summarizeGps(samples): FrictionFeatures`, `detectFriction(features): FrictionDecision`, `buildDemoSamples(scenario): GpsSample[]`

- [ ] **Step 1: GPS 룰 실패 테스트를 작성한다**

```ts
// src/features/friction/detector.test.ts
import { detectFriction, summarizeGps } from "./detector";
import { buildDemoSamples } from "./simulator";

describe("GPS friction detector", () => {
  it("detects repeated stop and movement around a destination", () => {
    const features = summarizeGps(buildDemoSamples("PARKING_SEARCH"));
    expect(features.stopCount).toBeGreaterThanOrEqual(3);
    expect(detectFriction(features)).toEqual(
      expect.objectContaining({
        detected: true,
        frictionTypes: expect.arrayContaining(["REPEATED_STOPS"]),
      }),
    );
  });

  it("does not flag a simple arrival", () => {
    const features = summarizeGps(buildDemoSamples("NORMAL_ARRIVAL"));
    expect(detectFriction(features).detected).toBe(false);
  });

  it("drops inaccurate GPS samples", () => {
    const samples = buildDemoSamples("NORMAL_ARRIVAL").concat({
      latitude: 37.6,
      longitude: 127.2,
      accuracyMeters: 120,
      timestampMs: 999_999,
    });
    expect(summarizeGps(samples).acceptedSampleCount).toBe(
      samples.length - 1,
    );
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `pnpm vitest run src/features/friction/detector.test.ts`

Expected: detector와 simulator가 없어 FAIL한다.

- [ ] **Step 3: GPS 타입과 결정론적 규칙을 구현한다**

```ts
// src/features/friction/types.ts
export type GpsSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestampMs: number;
};

export type FrictionFeatures = {
  dwellSeconds: number;
  stopCount: number;
  travelMeters: number;
  displacementMeters: number;
  acceptedSampleCount: number;
};

export type FrictionDecision = {
  detected: boolean;
  score: number;
  frictionTypes: Array<"LONG_DWELL" | "REPEATED_STOPS" | "REPEATED_MOVEMENT">;
  reasons: string[];
};
```

```ts
// src/features/friction/detector.ts
import type { FrictionDecision, FrictionFeatures, GpsSample } from "./types";

const MAX_ACCURACY_METERS = 50;
const STOP_MOVE_THRESHOLD_METERS = 12;

function haversineMeters(a: GpsSample, b: GpsSample) {
  const radius = 6_371_000;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function summarizeGps(samples: GpsSample[]): FrictionFeatures {
  const accepted = samples.filter((sample) => sample.accuracyMeters <= MAX_ACCURACY_METERS);
  const distances = accepted.slice(1).map((sample, index) =>
    haversineMeters(accepted[index], sample),
  );
  const movements = distances.map((distance) => distance >= STOP_MOVE_THRESHOLD_METERS);
  const stopCount = movements.reduce(
    (count, moved, index) => count + (!moved && (index === 0 || movements[index - 1]) ? 1 : 0),
    0,
  );
  const first = accepted.at(0);
  const last = accepted.at(-1);
  return {
    dwellSeconds: first && last ? Math.max(0, (last.timestampMs - first.timestampMs) / 1000) : 0,
    stopCount,
    travelMeters: distances.reduce((sum, distance) => sum + distance, 0),
    displacementMeters: first && last ? haversineMeters(first, last) : 0,
    acceptedSampleCount: accepted.length,
  };
}

export function detectFriction(features: FrictionFeatures): FrictionDecision {
  const frictionTypes: FrictionDecision["frictionTypes"] = [];
  const reasons: string[] = [];
  if (features.dwellSeconds >= 300) {
    frictionTypes.push("LONG_DWELL");
    reasons.push("배송지 인근 체류가 5분 이상입니다.");
  }
  if (features.stopCount >= 3) {
    frictionTypes.push("REPEATED_STOPS");
    reasons.push("정지와 이동이 3회 이상 반복됐습니다.");
  }
  if (features.travelMeters >= 150 && features.displacementMeters <= 60) {
    frictionTypes.push("REPEATED_MOVEMENT");
    reasons.push("배송지 인근 이동량에 비해 최종 변위가 작습니다.");
  }
  return {
    detected: frictionTypes.length > 0,
    score: Math.min(1, frictionTypes.length / 3),
    frictionTypes,
    reasons,
  };
}
```

- [ ] **Step 4: 발표용 정상·마찰 GPS fixture를 구현한다**

```ts
// src/features/friction/simulator.ts
import type { GpsSample } from "./types";

export function buildDemoSamples(
  scenario: "NORMAL_ARRIVAL" | "PARKING_SEARCH",
): GpsSample[] {
  const origin = { latitude: 37.4979, longitude: 127.0276 };
  const offsets =
    scenario === "NORMAL_ARRIVAL"
      ? [[0, 0], [0.00005, 0.00003], [0.00008, 0.00004]]
      : [
          [0, 0], [0.00002, 0.00001], [0.00025, 0.00015],
          [0.00026, 0.00015], [0.00003, 0.00002], [0.00004, 0.00002],
          [0.00027, -0.00012], [0.00028, -0.00012], [0.00002, 0.00001],
        ];
  return offsets.map(([lat, lon], index) => ({
    latitude: origin.latitude + lat,
    longitude: origin.longitude + lon,
    accuracyMeters: 8,
    timestampMs: index * (scenario === "NORMAL_ARRIVAL" ? 30_000 : 60_000),
  }));
}
```

- [ ] **Step 5: GPS 룰 테스트를 검증한다**

Run: `pnpm vitest run src/features/friction/detector.test.ts`

Expected: 3개 테스트 PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add src/features/friction
git commit -m "feat: detect delivery friction with GPS rules"
```

### Task 4: Gemini 질문 생성 서비스 구현

**Files:**
- Create: `src/lib/gemini/client.ts`
- Create: `src/features/questions/planner.ts`
- Create: `src/features/questions/planner.test.ts`
- Create: `src/app/api/questions/route.ts`
- Test: `src/app/api/questions/route.test.ts`

**Interfaces:**
- Consumes: `FrictionEvent`
- Produces: `planQuestion(event, generate): Promise<QuestionPlan>`, `POST /api/questions`

- [ ] **Step 1: 책임을 묻지 않는 질문 생성 실패 테스트를 작성한다**

```ts
// src/features/questions/planner.test.ts
import { planQuestion } from "./planner";

const event = {
  sessionId: "30000000-0000-0000-0000-000000000001",
  placeId: "20000000-0000-0000-0000-000000000001",
  vehicleType: "1TON" as const,
  frictionTypes: ["REPEATED_STOPS" as const],
  features: { dwellSeconds: 420, stopCount: 3, travelMeters: 180, displacementMeters: 25 },
};

describe("planQuestion", () => {
  it("returns a validated neutral Gemini question", async () => {
    const result = await planQuestion(event, async () => ({
      shouldAsk: true,
      frictionType: "PARKING_UNLOADING",
      question: "오늘 이 배송에서 차량을 세울 위치를 찾는 데 불편함이 있었나요?",
      choices: ["불편하지 않았어요", "정차 위치를 찾기 어려웠어요", "기타"],
    }));
    expect(result.question).not.toMatch(/왜|잘못|책임/);
  });

  it("uses a safe fallback when Gemini output is invalid", async () => {
    const result = await planQuestion(event, async () => ({
      shouldAsk: true,
      frictionType: "PARKING_UNLOADING",
      question: "왜 잘못 주차했나요?",
      choices: ["기사 실수", "기타"],
    }));
    expect(result.choices).toContain("불편하지 않았어요");
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `pnpm vitest run src/features/questions/planner.test.ts`

Expected: planner가 없어 FAIL한다.

- [ ] **Step 3: Gemini 클라이언트 경계와 안전한 fallback을 구현한다**

```ts
// src/lib/gemini/client.ts
import { GoogleGenAI } from "@google/genai";

export function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");
  return new GoogleGenAI({ apiKey });
}

export function getGeminiModel() {
  const model = process.env.GEMINI_MODEL;
  if (!model) throw new Error("GEMINI_MODEL is required");
  return model;
}
```

```ts
// src/features/questions/planner.ts
import { QuestionPlanSchema, type FrictionEvent, type QuestionPlan } from "@/lib/gemini/types";

type QuestionGenerator = (event: FrictionEvent) => Promise<unknown>;

const fallback: QuestionPlan = {
  shouldAsk: true,
  frictionType: "PARKING_UNLOADING",
  question: "오늘 이 배송에서 장소나 시설 때문에 불편한 점이 있었나요?",
  choices: [
    "불편하지 않았어요",
    "출입구를 찾기 어려웠어요",
    "정차·하역이 어려웠어요",
    "차량 진입이 어려웠어요",
    "출입 등록이 필요했어요",
    "기타",
  ],
};

export async function planQuestion(
  event: FrictionEvent,
  generate: QuestionGenerator,
): Promise<QuestionPlan> {
  try {
    return QuestionPlanSchema.parse(await generate(event));
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 4: Gemini Structured Output 호출과 API route를 구현한다**

```ts
// src/app/api/questions/route.ts
import { z } from "zod";
import { createGeminiClient, getGeminiModel } from "@/lib/gemini/client";
import { FrictionEventSchema, QuestionPlanSchema } from "@/lib/gemini/types";
import { planQuestion } from "@/features/questions/planner";

export async function POST(request: Request) {
  const event = FrictionEventSchema.parse(await request.json());
  const ai = createGeminiClient();
  const result = await planQuestion(event, async (input) => {
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: `배송 마찰 이벤트: ${JSON.stringify(input)}`,
      config: {
        systemInstruction: [
          "당신은 배송 완료 후 기사에게 한 번의 짧은 확인 질문을 작성한다.",
          "기사의 책임이나 실수를 암시하지 않는다.",
          "배송지 문제가 있었다고 단정하지 않는다.",
          "개인정보를 묻지 않는다.",
          "선택지에 반드시 '불편하지 않았어요'를 포함한다.",
        ].join(" "),
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(QuestionPlanSchema),
      },
    });
    return JSON.parse(response.text ?? "{}");
  });
  return Response.json(result);
}
```

- [ ] **Step 5: Gemini를 mock한 route 테스트를 작성하고 실행한다**

```ts
// src/app/api/questions/route.test.ts
vi.mock("@/lib/gemini/client", () => ({
  getGeminiModel: () => "test-model",
  createGeminiClient: () => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          shouldAsk: true,
          frictionType: "PARKING_UNLOADING",
          question: "오늘 정차 위치를 찾는 데 불편함이 있었나요?",
          choices: ["불편하지 않았어요", "정차 위치를 찾기 어려웠어요"],
        }),
      }),
    },
  }),
}));

it("returns a structured question", async () => {
  const { POST } = await import("./route");
  const response = await POST(new Request("http://localhost/api/questions", {
    method: "POST",
    body: JSON.stringify({
      sessionId: "30000000-0000-0000-0000-000000000001",
      placeId: "20000000-0000-0000-0000-000000000001",
      vehicleType: "1TON",
      frictionTypes: ["REPEATED_STOPS"],
      features: { dwellSeconds: 420, stopCount: 3, travelMeters: 180, displacementMeters: 25 },
    }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(expect.objectContaining({ shouldAsk: true }));
});
```

Run: `pnpm vitest run src/features/questions/planner.test.ts src/app/api/questions/route.test.ts`

Expected: 모든 질문 생성 테스트 PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add src/lib/gemini src/features/questions src/app/api/questions
git commit -m "feat: generate neutral friction questions with Gemini"
```

### Task 5: 개인정보 마스킹과 Gemini 멀티모달 지식 추출 구현

**Files:**
- Create: `src/features/privacy/sanitizer.ts`
- Create: `src/features/privacy/sanitizer.test.ts`
- Create: `src/features/knowledge/extractor.ts`
- Create: `src/features/knowledge/extractor.test.ts`

**Interfaces:**
- Consumes: 선택 응답 또는 텍스트와 일시적 음성·사진 바이트
- Produces: `sanitizeText(text): SanitizedText`, `extractKnowledge(input, generate): Promise<KnowledgeExtraction>`

- [ ] **Step 1: 한국형 개인정보 마스킹 실패 테스트를 작성한다**

```ts
// src/features/privacy/sanitizer.test.ts
import { sanitizeText } from "./sanitizer";

describe("sanitizeText", () => {
  it("removes personal contact and unit information without dropping operational knowledge", () => {
    const result = sanitizeText(
      "김철수 고객은 101동 1203호이고 010-1234-5678로 전화하세요. 화물차는 후문으로 들어가세요.",
    );
    expect(result.text).not.toContain("010-1234-5678");
    expect(result.text).not.toContain("101동 1203호");
    expect(result.text).toContain("화물차는 후문으로 들어가세요");
    expect(result.removedPiiTypes).toEqual(expect.arrayContaining(["PHONE", "UNIT"]));
  });

  it("masks keypad passwords", () => {
    const result = sanitizeText("공동현관 비밀번호는 2580#이고 B2 하역장을 이용하세요.");
    expect(result.text).not.toContain("2580#");
    expect(result.text).toContain("B2 하역장을 이용하세요");
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `pnpm vitest run src/features/privacy/sanitizer.test.ts`

Expected: sanitizer가 없어 FAIL한다.

- [ ] **Step 3: 결정론적 1차·2차 텍스트 마스킹을 구현한다**

```ts
// src/features/privacy/sanitizer.ts
export type PiiType = "PHONE" | "EMAIL" | "UNIT" | "PASSWORD";

export function sanitizeText(input: string) {
  const removed = new Set<PiiType>();
  const patterns: Array<[PiiType, RegExp]> = [
    ["PHONE", /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g],
    ["EMAIL", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
    ["UNIT", /\d{1,4}동\s*\d{1,4}호/g],
    ["PASSWORD", /(?:비밀번호|공동현관|출입번호)(?:는|은|:)?\s*[0-9*#]{3,12}/g],
  ];
  let text = input;
  for (const [type, pattern] of patterns) {
    if (pattern.test(text)) {
      removed.add(type);
      pattern.lastIndex = 0;
      text = text.replace(pattern, `[${type}_REMOVED]`);
    }
  }
  return { text, removedPiiTypes: [...removed] };
}
```

- [ ] **Step 4: Gemini 지식 추출 실패 테스트를 작성한다**

```ts
// src/features/knowledge/extractor.test.ts
import { extractKnowledge } from "./extractor";

describe("extractKnowledge", () => {
  it("stores sanitized content as atomic claims", async () => {
    const result = await extractKnowledge(
      { mode: "TEXT", text: "010-1234-5678로 연락하고 화물차는 후문으로 가세요." },
      async ({ sanitizedText }) => ({
        sanitizedSummary: "화물차는 후문으로 진입합니다.",
        removedPiiTypes: sanitizedText.includes("PHONE_REMOVED") ? ["PHONE"] : [],
        claims: [{
          type: "ENTRANCE_RECOMMENDATION",
          value: "후문 진입",
          vehicleType: "ALL",
          timeCondition: null,
          evidence: "화물차는 후문으로 가세요",
        }],
      }),
    );
    expect(result.sanitizedSummary).not.toMatch(/010[-\s]?1234/);
    expect(result.claims[0].value).toBe("후문 진입");
  });
});
```

- [ ] **Step 5: 일시적 미디어 입력과 Gemini 추출 경계를 구현한다**

```ts
// src/features/knowledge/extractor.ts
import { KnowledgeExtractionSchema, type KnowledgeExtraction } from "@/lib/gemini/types";
import { sanitizeText } from "@/features/privacy/sanitizer";

export type ReportInput =
  | { mode: "CHOICE" | "TEXT"; text: string }
  | { mode: "VOICE" | "PHOTO"; bytes: Uint8Array; mimeType: string; caption?: string };

type ExtractionGenerator = (input: {
  mode: ReportInput["mode"];
  sanitizedText: string;
  bytes?: Uint8Array;
  mimeType?: string;
}) => Promise<unknown>;

export async function extractKnowledge(
  input: ReportInput,
  generate: ExtractionGenerator,
): Promise<KnowledgeExtraction> {
  const rawText = "text" in input ? input.text : input.caption ?? "";
  const sanitized = sanitizeText(rawText);
  const generated = await generate({
    mode: input.mode,
    sanitizedText: sanitized.text,
    bytes: "bytes" in input ? input.bytes : undefined,
    mimeType: "mimeType" in input ? input.mimeType : undefined,
  });
  const parsed = KnowledgeExtractionSchema.parse(generated);
  const postSanitized = sanitizeText(parsed.sanitizedSummary);
  return {
    ...parsed,
    sanitizedSummary: postSanitized.text,
    removedPiiTypes: [...new Set([...parsed.removedPiiTypes, ...sanitized.removedPiiTypes])],
    claims: parsed.claims.map((claim) => ({
      ...claim,
      value: sanitizeText(claim.value).text,
      evidence: sanitizeText(claim.evidence).text,
    })),
  };
}
```

- [ ] **Step 6: Gemini 멀티모달 Structured Output generator를 구현한다**

Add `generateKnowledgeWithGemini` to `src/features/knowledge/extractor.ts`:

```ts
import { z } from "zod";
import { createGeminiClient, getGeminiModel } from "@/lib/gemini/client";

export async function generateKnowledgeWithGemini(input: {
  mode: ReportInput["mode"];
  sanitizedText: string;
  bytes?: Uint8Array;
  mimeType?: string;
}) {
  const parts: Array<Record<string, unknown>> = [{
    text: `비식별 텍스트 입력: ${input.sanitizedText}`,
  }];
  if (input.bytes && input.mimeType) {
    parts.push({
      inlineData: {
        mimeType: input.mimeType,
        data: Buffer.from(input.bytes).toString("base64"),
      },
    });
  }
  const response = await createGeminiClient().models.generateContent({
    model: getGeminiModel(),
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: [
        "배송지에서 다음 기사도 재사용할 수 있는 공용 운영 지식만 추출한다.",
        "이름, 전화번호, 이메일, 동호수, 출입 비밀번호, 얼굴, 차량번호는 출력하지 않는다.",
        "개인정보가 있던 자리만 제거하고 출입구, 하역장, 차량 제한, 공용 절차는 유지한다.",
        "입력에 명시되지 않은 시간, 높이, 위치, 규칙을 만들지 않는다.",
        "서로 독립적으로 검증할 수 있도록 한 사실을 한 claim으로 분리한다.",
      ].join(" "),
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(KnowledgeExtractionSchema),
    },
  });
  return JSON.parse(response.text ?? "{}");
}
```

`POST /api/reports` passes `generateKnowledgeWithGemini` to `extractKnowledge`. It must not retain `parts`, base64 data, or the Gemini request object after the request completes.

- [ ] **Step 7: 개인정보와 추출 테스트를 검증한다**

Run:

```bash
pnpm vitest run src/features/privacy/sanitizer.test.ts
pnpm vitest run src/features/knowledge/extractor.test.ts
```

Expected: 개인정보는 사라지고 운영 지식은 유지되는 테스트 PASS.

- [ ] **Step 8: 커밋한다**

```bash
git add src/features/privacy src/features/knowledge/extractor.*
git commit -m "feat: sanitize reports and extract operational knowledge"
```

### Task 6: 제보 저장 API와 즉시 기본 포인트 지급 구현

**Files:**
- Create: `src/features/rewards/service.ts`
- Create: `src/features/rewards/service.test.ts`
- Create: `src/app/api/reports/route.ts`
- Test: `src/app/api/reports/route.test.ts`

**Interfaces:**
- Consumes: `multipart/form-data`의 `sessionId`, `mode`, `text` 또는 `media`
- Produces: `createReportWithClaims(...)`, `awardBaseReportPoints(...)`, `POST /api/reports`

- [ ] **Step 1: 포인트 정책 실패 테스트를 작성한다**

```ts
// src/features/rewards/service.test.ts
import { pointsForEvent } from "./service";

describe("pointsForEvent", () => {
  it("awards more after validation than initial registration", () => {
    expect(pointsForEvent("REPORT_CREATED")).toBe(10);
    expect(pointsForEvent("CLAIM_VERIFIED")).toBe(20);
    expect(pointsForEvent("GUIDE_HELPFUL")).toBe(5);
  });
});
```

- [ ] **Step 2: 테스트 실패를 확인하고 포인트 정책을 구현한다**

Run: `pnpm vitest run src/features/rewards/service.test.ts`

Expected: service가 없어 FAIL한다.

```ts
// src/features/rewards/service.ts
export type RewardReason = "REPORT_CREATED" | "CLAIM_VERIFIED" | "GUIDE_HELPFUL";

const points: Record<RewardReason, number> = {
  REPORT_CREATED: 10,
  CLAIM_VERIFIED: 20,
  GUIDE_HELPFUL: 5,
};

export function pointsForEvent(reason: RewardReason) {
  return points[reason];
}
```

- [ ] **Step 3: report API 테스트를 작성한다**

```ts
// src/app/api/reports/route.test.ts
it("stores only sanitized report data and awards base points", async () => {
  const repository = {
    createReportWithClaims: vi.fn().mockResolvedValue({
      reportId: "40000000-0000-0000-0000-000000000001",
      claimIds: ["50000000-0000-0000-0000-000000000001"],
      awardedPoints: 10,
    }),
  };
  const result = await repository.createReportWithClaims({
    sanitizedSummary: "후문으로 진입하세요.",
    removedPiiTypes: ["PHONE"],
  });
  expect(result.awardedPoints).toBe(10);
  expect(repository.createReportWithClaims).not.toHaveBeenCalledWith(
    expect.objectContaining({ rawText: expect.anything() }),
  );
});
```

- [ ] **Step 4: 하나의 DB transaction으로 report·claim·points를 저장한다**

Implement `POST /api/reports` with this exact processing order:

```ts
const form = await request.formData();
const sessionId = String(form.get("sessionId"));
const mode = String(form.get("mode")) as "CHOICE" | "TEXT" | "VOICE" | "PHOTO";
const text = String(form.get("text") ?? "");
const media = form.get("media");

// 1. media가 File이면 arrayBuffer를 메모리에서만 읽는다.
// 2. extractKnowledge로 비식별 결과를 만든다.
// 3. reports에는 sanitizedSummary와 removedPiiTypes만 insert한다.
// 4. claims에는 원자 단위 주장만 insert한다.
// 5. points_ledger에 REPORT_CREATED 10점을 insert한다.
// 6. 원본 text, File, ArrayBuffer를 로그나 Storage에 쓰지 않는다.
return Response.json({ reportId, claimIds, awardedPoints: 10 }, { status: 201 });
```

The database transaction must be a Supabase RPC named `create_report_with_claims` so partial writes cannot occur. Add it to `supabase/migrations/202608130001_initial_schema.sql` with parameters for sanitized report JSON, claims JSON, and points.

- [ ] **Step 5: API 테스트와 전체 단위 테스트를 실행한다**

Run:

```bash
pnpm vitest run src/features/rewards/service.test.ts src/app/api/reports/route.test.ts
pnpm vitest run
```

Expected: report와 포인트 테스트 PASS, 원본 개인정보 필드가 repository 호출에 없음.

- [ ] **Step 6: 커밋한다**

```bash
git add src/features/rewards src/app/api/reports supabase/migrations
git commit -m "feat: store sanitized reports and award base points"
```

### Task 7: Gemini 주장 매칭과 Rule 기반 신뢰도 검증 구현

**Files:**
- Create: `src/features/knowledge/matcher.ts`
- Create: `src/features/knowledge/matcher.test.ts`
- Create: `src/features/validation/confidence.ts`
- Create: `src/features/validation/confidence.test.ts`
- Create: `src/app/api/feedback/route.ts`
- Modify: `src/app/api/reports/route.ts`
- Test: `src/app/api/feedback/route.test.ts`

**Interfaces:**
- Consumes: 새 `Claim`, 같은 장소의 기존 `Claim[]`, 기사 피드백
- Produces: `matchClaim(...)`, `calculateClaimState(...)`, `POST /api/feedback`

- [ ] **Step 1: 의미 매칭과 신뢰도 정책 실패 테스트를 작성한다**

```ts
// src/features/validation/confidence.test.ts
import { calculateClaimState } from "./confidence";

describe("calculateClaimState", () => {
  it("verifies a claim after an independent support", () => {
    expect(calculateClaimState({ supports: 1, gpsSupports: 0, helpful: 0, contradicts: 0 }))
      .toEqual({ status: "VERIFIED", confidence: 0.65 });
  });

  it("marks repeated contradictions as conflict", () => {
    expect(calculateClaimState({ supports: 0, gpsSupports: 0, helpful: 0, contradicts: 2 }).status)
      .toBe("CONFLICT");
  });
});
```

```ts
// src/features/knowledge/matcher.test.ts
import { matchClaim } from "./matcher";

it("accepts a structured Gemini relation", async () => {
  const result = await matchClaim(
    { type: "ENTRANCE_RECOMMENDATION", value: "후문 진입" },
    [{ id: "claim-1", type: "ENTRANCE_RECOMMENDATION", value: "화물차는 후문 이용" }],
    async () => ({ relation: "SUPPORTS", targetClaimId: "claim-1" }),
  );
  expect(result.relation).toBe("SUPPORTS");
});
```

- [ ] **Step 2: 실패를 확인하고 결정론적 신뢰도 정책을 구현한다**

Run:

```bash
pnpm vitest run src/features/validation/confidence.test.ts
pnpm vitest run src/features/knowledge/matcher.test.ts
```

Expected: 모듈이 없어 FAIL한다.

```ts
// src/features/validation/confidence.ts
type EvidenceCounts = {
  supports: number;
  gpsSupports: number;
  helpful: number;
  contradicts: number;
};

export function calculateClaimState(counts: EvidenceCounts) {
  const confidence = Math.max(
    0,
    Math.min(
      1,
      0.35 + counts.supports * 0.3 + counts.gpsSupports * 0.15 + counts.helpful * 0.1 - counts.contradicts * 0.25,
    ),
  );
  const rounded = Math.round(confidence * 100) / 100;
  if (counts.contradicts >= 2) return { status: "CONFLICT" as const, confidence: rounded };
  if (counts.supports >= 1 && rounded >= 0.65) return { status: "VERIFIED" as const, confidence: rounded };
  return { status: "CANDIDATE" as const, confidence: rounded };
}
```

- [ ] **Step 3: Gemini matcher 출력 스키마와 fallback을 구현한다**

```ts
// src/features/knowledge/matcher.ts
import { z } from "zod";

const MatchSchema = z.object({
  relation: z.enum(["SUPPORTS", "CONTRADICTS", "NEW"]),
  targetClaimId: z.string().nullable(),
});

type MatchGenerator = (input: unknown) => Promise<unknown>;

export async function matchClaim(
  candidate: { type: string; value: string },
  existing: Array<{ id: string; type: string; value: string }>,
  generate: MatchGenerator,
) {
  if (existing.length === 0) return { relation: "NEW" as const, targetClaimId: null };
  try {
    return MatchSchema.parse(await generate({ candidate, existing }));
  } catch {
    const exact = existing.find(
      (claim) => claim.type === candidate.type && claim.value.trim() === candidate.value.trim(),
    );
    return exact
      ? { relation: "SUPPORTS" as const, targetClaimId: exact.id }
      : { relation: "NEW" as const, targetClaimId: null };
  }
}
```

Add a production generator in the same file:

```ts
import { createGeminiClient, getGeminiModel } from "@/lib/gemini/client";

export async function generateClaimMatch(input: unknown) {
  const response = await createGeminiClient().models.generateContent({
    model: getGeminiModel(),
    contents: `후보 주장과 기존 주장을 비교하세요: ${JSON.stringify(input)}`,
    config: {
      systemInstruction: "사실 여부를 판단하지 말고 의미 관계만 SUPPORTS, CONTRADICTS, NEW 중 하나로 분류한다.",
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(MatchSchema),
    },
  });
  return JSON.parse(response.text ?? "{}");
}
```

- [ ] **Step 4: 피드백 API를 구현한다**

`POST /api/feedback` accepts this body:

```json
{
  "claimId": "50000000-0000-0000-0000-000000000001",
  "driverProfileId": "10000000-0000-0000-0000-000000000002",
  "feedback": "HELPFUL"
}
```

The route must:

1. 같은 기사의 중복 evidence를 unique constraint로 무시한다.
2. `HELPFUL`이면 evidence와 5포인트를 한 transaction에 기록한다.
3. `CONFIRM`이면 `SUPPORTS`, `CHANGED`이면 `CONTRADICTS` evidence를 기록한다.
4. evidence 집계를 다시 읽어 `calculateClaimState`로 status와 confidence를 갱신한다.
5. 처음 `VERIFIED`로 전환된 경우 원 제보 기사에게 20포인트를 한 번만 지급한다.

- [ ] **Step 5: 새 제보를 기존 주장과 연결한다**

Modify `POST /api/reports` after extraction:

1. 같은 `place_id`, `claim_type`, `vehicle_type`의 기존 주장을 읽는다.
2. `matchClaim`을 Gemini Structured Output 호출로 실행한다.
3. `SUPPORTS`이면 중복 claim을 만들지 않고 기존 claim에 독립 기사의 `REPORT/SUPPORTS` evidence를 추가한다.
4. `CONTRADICTS`이면 기존 claim에 `REPORT/CONTRADICTS` evidence를 추가하고 새 조건부 claim도 CANDIDATE로 저장한다.
5. `NEW`이면 새 CANDIDATE claim을 저장한다.
6. evidence 변경 후 `calculateClaimState`를 실행해 claim 상태와 보너스를 갱신한다.

- [ ] **Step 6: 검증·포인트 API 테스트를 실행한다**

Run:

```bash
pnpm vitest run src/features/knowledge/matcher.test.ts
pnpm vitest run src/features/validation/confidence.test.ts
pnpm vitest run src/app/api/feedback/route.test.ts
```

Expected: 독립 확인 후 VERIFIED, 반복 반대 후 CONFLICT, 도움됨 추가 포인트 테스트 PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add src/features/knowledge/matcher.* src/features/validation src/app/api/feedback
git commit -m "feat: validate knowledge with independent evidence"
```

### Task 8: 검증된 지식의 다음 배송 가이드 생성과 조회 구현

**Files:**
- Create: `src/features/guides/composer.ts`
- Create: `src/features/guides/composer.test.ts`
- Create: `src/app/api/guides/route.ts`
- Test: `src/app/api/guides/route.test.ts`

**Interfaces:**
- Consumes: `status = VERIFIED`이며 장소·차량 조건이 맞는 claims
- Produces: `composeGuide(...)`, `GET /api/guides?placeId=&vehicleType=`

- [ ] **Step 1: 검증된 주장만 사용하는 실패 테스트를 작성한다**

```ts
// src/features/guides/composer.test.ts
import { composeGuide } from "./composer";

it("excludes unverified claims and keeps claim provenance", async () => {
  const result = await composeGuide(
    [
      { id: "verified-1", status: "VERIFIED", value: "1톤 차량은 후문으로 진입" },
      { id: "candidate-1", status: "CANDIDATE", value: "정문 운영시간은 오전 9시" },
    ],
    async () => ({
      items: [{ text: "1톤 차량은 후문으로 진입하세요.", sourceClaimIds: ["verified-1"] }],
    }),
  );
  expect(result.items).toHaveLength(1);
  expect(result.items[0].sourceClaimIds).toEqual(["verified-1"]);
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `pnpm vitest run src/features/guides/composer.test.ts`

Expected: composer가 없어 FAIL한다.

- [ ] **Step 3: Gemini guide composer와 결정론적 fallback을 구현한다**

```ts
// src/features/guides/composer.ts
import { z } from "zod";

const GuideSchema = z.object({
  items: z.array(z.object({
    text: z.string().min(1).max(100),
    sourceClaimIds: z.array(z.string()).min(1),
  })).max(5),
});

type StoredClaim = { id: string; status: string; value: string };

export async function composeGuide(
  claims: StoredClaim[],
  generate: (verifiedClaims: StoredClaim[]) => Promise<unknown>,
) {
  const verified = claims.filter((claim) => claim.status === "VERIFIED");
  if (verified.length === 0) return { items: [] };
  try {
    const parsed = GuideSchema.parse(await generate(verified));
    const allowedIds = new Set(verified.map((claim) => claim.id));
    if (parsed.items.some((item) => item.sourceClaimIds.some((id) => !allowedIds.has(id)))) {
      throw new Error("Guide referenced an unverified claim");
    }
    return parsed;
  } catch {
    return {
      items: verified.slice(0, 5).map((claim) => ({
        text: claim.value.endsWith(".") ? claim.value : `${claim.value}.`,
        sourceClaimIds: [claim.id],
      })),
    };
  }
}
```

Add a production generator in the same file:

```ts
import { createGeminiClient, getGeminiModel } from "@/lib/gemini/client";

export async function generateGuide(verifiedClaims: StoredClaim[]) {
  const response = await createGeminiClient().models.generateContent({
    model: getGeminiModel(),
    contents: `검증된 주장: ${JSON.stringify(verifiedClaims)}`,
    config: {
      systemInstruction: "검증된 주장만 사용해 다음 배송인이 즉시 행동할 수 있는 한국어 문장 최대 5개를 작성하고 각 문장에 sourceClaimIds를 연결한다.",
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(GuideSchema),
    },
  });
  return JSON.parse(response.text ?? "{}");
}
```

- [ ] **Step 4: 가이드 조회 API를 구현한다**

`GET /api/guides` must return `{ items, pendingConfirmation }` and:

1. `placeId`와 `vehicleType`을 검증한다.
2. 미리 생성된 `guides` row가 있으면 그대로 반환한다.
3. row가 없으면 해당 조건의 VERIFIED claims만 읽어 `composeGuide`를 호출한다.
4. 생성 결과와 `source_claim_ids`를 upsert한 후 반환한다.
5. 후보·충돌·오래된 주장은 가이드 생성용 Gemini 입력에 포함하지 않는다.
6. 같은 조건의 CANDIDATE claim이 있으면 가장 최근 한 건을 `pendingConfirmation`으로 별도 반환한다.
7. `pendingConfirmation`은 검증 질문에만 사용하며 정식 가이드 항목처럼 표시하지 않는다.

- [ ] **Step 5: 테스트와 커밋을 수행한다**

Run:

```bash
pnpm vitest run src/features/guides/composer.test.ts src/app/api/guides/route.test.ts
pnpm vitest run
```

Expected: 검증된 주장만 가이드에 포함되고 source claim 연결 테스트 PASS.

```bash
git add src/features/guides src/app/api/guides
git commit -m "feat: publish verified delivery guides"
```

### Task 9: 현재 기사 → 처리 → 다음 기사 웹 사용자 흐름 구현

**Files:**
- Create: `src/components/delivery-tracker.tsx`
- Create: `src/components/friction-question.tsx`
- Create: `src/components/contribution-form.tsx`
- Create: `src/components/processing-timeline.tsx`
- Create: `src/components/guide-card.tsx`
- Create: `src/app/delivery/page.tsx`
- Create: `src/app/contribute/page.tsx`
- Create: `src/app/guide/page.tsx`
- Test: `src/components/delivery-tracker.test.tsx`
- Test: `src/components/contribution-form.test.tsx`
- Test: `src/components/guide-card.test.tsx`

**Interfaces:**
- Consumes: Task 3~8의 GPS Rule과 API endpoints
- Produces: 발표 가능한 세 화면과 실제/시뮬레이션 GPS 흐름

- [ ] **Step 1: 배송 추적 화면의 실패 테스트를 작성한다**

```tsx
// src/components/delivery-tracker.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliveryTracker } from "./delivery-tracker";

it("runs the deterministic friction demo", async () => {
  const onFriction = vi.fn();
  render(<DeliveryTracker onFriction={onFriction} />);
  await userEvent.click(screen.getByRole("button", { name: "정차 탐색 시뮬레이션" }));
  expect(onFriction).toHaveBeenCalledWith(
    expect.objectContaining({ detected: true }),
  );
});
```

- [ ] **Step 2: 질문·제보·가이드 실패 테스트를 작성한다**

```tsx
// src/components/contribution-form.test.tsx
it("shows base points after a successful sanitized report", async () => {
  render(<ContributionForm sessionId="30000000-0000-0000-0000-000000000001" />);
  await userEvent.type(screen.getByLabelText("현장 설명"), "후문으로 진입하세요");
  await userEvent.click(screen.getByRole("button", { name: "제보 등록" }));
  expect(await screen.findByText("기본 포인트 +10P")).toBeInTheDocument();
});
```

```tsx
// src/components/guide-card.test.tsx
it("lets the next driver validate a guide", async () => {
  const onFeedback = vi.fn();
  render(<GuideCard text="1톤 차량은 후문으로 진입하세요." onFeedback={onFeedback} />);
  await userEvent.click(screen.getByRole("button", { name: "도움됐어요" }));
  expect(onFeedback).toHaveBeenCalledWith("HELPFUL");
});
```

- [ ] **Step 3: 테스트 실패를 확인한다**

Run:

```bash
pnpm vitest run src/components/delivery-tracker.test.tsx
pnpm vitest run src/components/contribution-form.test.tsx
pnpm vitest run src/components/guide-card.test.tsx
```

Expected: 컴포넌트가 없어 FAIL한다.

- [ ] **Step 4: 배송 추적 화면을 구현한다**

`DeliveryTracker` must provide exactly two tracking modes:

- `실제 GPS 시작`: 권한 안내 후 `watchPosition()`을 시작하고 컴포넌트 state에만 samples를 유지한다.
- `정차 탐색 시뮬레이션`: `buildDemoSamples("PARKING_SEARCH")`를 사용한다.

배송 완료 시 `summarizeGps`와 `detectFriction`을 실행하고, 집계 features만 `/api/questions`에 전달한다. 완료·취소 시 samples 배열을 즉시 비운다.

해커톤 데모에서는 `/delivery` 요청을 seed 가명 `현장기사 A`에, `/guide`의 검증 피드백을 별도 seed 가명 `현장기사 B`에 바인딩한다. 클라이언트가 보낸 임의의 `driverProfileId`는 신뢰하지 않으며, 이 데모 바인딩은 외부 파일럿에서 Supabase Auth 세션의 사용자 ID로 교체한다.

- [ ] **Step 5: 질문과 멀티모달 응답 화면을 구현한다**

`FrictionQuestion` renders the server-provided question and choices. `ContributionForm` supports:

- 선택형 응답
- 500자 이하 텍스트
- `audio/*` 파일 하나
- `image/*` 파일 하나
- 8MB 최대 파일 크기

클라이언트는 FormData를 `/api/reports`에 전송하고 성공 시 `기본 포인트 +10P`와 처리 타임라인 `개인정보 제거 → Gemini 구조화 → 후보 지식 저장`을 표시한다.

- [ ] **Step 6: 다음 배송 가이드 화면을 구현한다**

`/guide?placeId=...&vehicleType=1TON`에서 `/api/guides`를 호출하여 최대 5개의 검증된 행동 가이드를 보여준다. 각 가이드는 `도움됐어요`, `정보가 달라요`를 제공한다. `pendingConfirmation`이 있으면 `이전 운송인은 “1톤 차량은 후문으로 진입해야 한다”고 알려줬습니다. 현재도 맞나요?`를 별도 카드로 보여주고 `맞아요`, `달라졌어요`를 제공한다. `/api/feedback`에는 각각 `HELPFUL`, `CHANGED`, `CONFIRM`, `CHANGED`를 전송한다.

- [ ] **Step 7: 컴포넌트 테스트와 접근성을 검증한다**

Run:

```bash
pnpm vitest run src/components
pnpm lint
pnpm build
```

Expected: 컴포넌트 테스트 PASS, 모든 입력에 label 존재, 빌드 성공.

- [ ] **Step 8: 커밋한다**

```bash
git add src/components src/app/delivery src/app/contribute src/app/guide
git commit -m "feat: complete driver knowledge loop UI"
```

### Task 10: E2E 데모, 개인정보 회귀검사, Railway 배포

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/milezero-flow.spec.ts`
- Create: `src/app/api/health/route.ts`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `railway.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: 완성된 웹앱과 Supabase seed
- Produces: 배포 URL에서 재현 가능한 전체 데모와 운영 체크리스트

- [ ] **Step 1: 전체 데모 E2E 실패 테스트를 작성한다**

```ts
// tests/e2e/milezero-flow.spec.ts
import { test, expect } from "@playwright/test";

test("friction report becomes a validated guide", async ({ page }) => {
  await page.goto("/delivery");
  await page.getByRole("button", { name: "정차 탐색 시뮬레이션" }).click();
  await expect(page.getByText(/차량을 세울 위치|장소나 시설/)).toBeVisible();
  await page.getByText("정차 위치를 찾기 어려웠어요").click();
  await page.getByLabel("현장 설명").fill(
    "010-1234-5678로 연락하지 말고 1톤 차량은 후문으로 진입하세요.",
  );
  await page.getByRole("button", { name: "제보 등록" }).click();
  await expect(page.getByText("기본 포인트 +10P")).toBeVisible();

  await page.goto("/guide?placeId=20000000-0000-0000-0000-000000000001&vehicleType=1TON");
  await expect(page.getByText(/이전 운송인은/)).toBeVisible();
  await page.getByRole("button", { name: "맞아요" }).click();
  await page.reload();
  await expect(page.getByText("1톤 차량은 후문으로 진입하세요.")).toBeVisible();
  await page.getByRole("button", { name: "도움됐어요" }).click();
  await expect(page.getByText(/피드백이 반영됐습니다/)).toBeVisible();
});
```

- [ ] **Step 2: 개인정보가 DB에 남지 않는 회귀검사를 추가한다**

After the report request, query the test Supabase database and assert:

```ts
expect(JSON.stringify({ reports, claims, guides })).not.toContain("010-1234-5678");
expect(JSON.stringify({ reports, claims, guides })).not.toMatch(/\d{1,4}동\s*\d{1,4}호/);
expect(reports[0].removed_pii_types).toContain("PHONE");
```

- [ ] **Step 3: E2E가 실패하는 것을 확인한다**

Run: `pnpm playwright test tests/e2e/milezero-flow.spec.ts`

Expected: 초기에는 fixture 또는 배포 설정 부족으로 FAIL한다.

- [ ] **Step 4: 테스트 전용 Gemini adapter를 추가한다**

When `GEMINI_ADAPTER=fixture`, the server must return deterministic structured responses from checked-in TypeScript fixtures. Production must reject `GEMINI_ADAPTER=fixture` when `VERCEL_ENV=production`. This keeps CI stable while the deployed demo uses the real Gemini API.

- [ ] **Step 5: 전체 검증 명령을 실행한다**

Run:

```bash
pnpm lint
pnpm vitest run
pnpm build
pnpm playwright test
```

Expected: lint, unit tests, production build, E2E 모두 성공.

- [ ] **Step 6: 이식 가능한 production 컨테이너를 구성한다**

```ts
// src/app/api/health/route.ts
export function GET() {
  return Response.json({ status: "ok" });
}
```

```dockerfile
# Dockerfile
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

```text
# .dockerignore
.git
.next
node_modules
tests
playwright-report
.env*
!.env.example
```

```json
// railway.json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

Run:

```bash
docker build -t milezero:local .
docker run --rm -d --name milezero-smoke -p 3000:3000 milezero:local
curl --fail http://localhost:3000/api/health
docker stop milezero-smoke
```

Expected: image build 성공, health endpoint가 HTTP 200과 `{ "status": "ok" }`를 반환한다.

- [ ] **Step 7: Railway와 Supabase production 환경을 구성한다**

Run:

```bash
pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF"
pnpm exec supabase db push
npm install --global @railway/cli
railway login
railway init
```

Railway의 서비스 `Variables`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.6-flash`를 입력한다. `SUPABASE_SERVICE_ROLE_KEY`와 `GEMINI_API_KEY`는 sealed secret으로 설정한다. 이어서 실행한다:

```bash
railway up
railway logs
railway domain
```

Expected: Railway가 root `Dockerfile`을 사용하고 `/api/health` 검사를 통과한 뒤 HTTPS public domain을 반환한다. 다른 컨테이너 호스트를 선택하면 같은 `Dockerfile` 이미지를 사용하고 `PORT`, 네 환경변수, `/api/health`만 동일하게 설정한다.

- [ ] **Step 8: 배포 URL에서 수동 스모크 테스트를 수행한다**

Verify in this exact order:

1. 모바일 브라우저에서 홈과 배송 화면이 열린다.
2. 실제 GPS 권한 요청이 HTTPS에서 나타난다.
3. 정차 탐색 시뮬레이션이 마찰 질문을 표시한다.
4. 전화번호를 포함한 텍스트 제보가 재질문 없이 처리된다.
5. 화면과 DB에는 마스킹된 결과와 후보 지식만 남는다.
6. 기본 포인트 10점이 즉시 표시된다.
7. 다른 기사 역할에서 확인 후 claim 상태와 추가 포인트가 갱신된다.
8. 검증된 가이드가 다음 배송 화면에 표시된다.

- [ ] **Step 9: README에 실행·배포·개인정보 정책을 문서화한다**

Add commands `pnpm dev`, `pnpm vitest run`, `pnpm playwright test`, required environment variable names, Supabase migration command, production URL, and the statement: `MileZero는 원본 GPS 궤적·음성·사진과 수령인 개인정보를 영구 저장하지 않습니다.`

- [ ] **Step 10: 최종 커밋한다**

```bash
git add playwright.config.ts tests src/app/api/health Dockerfile .dockerignore railway.json README.md
git commit -m "test: verify and document deployable MileZero demo"
```

## Delivery Order and Cut Line

해커톤 시간이 부족하면 아래 순서로 자른다.

1. **필수:** Task 1~6 — GPS 마찰 탐지, Gemini 질문·지식 추출, 개인정보 제거, 기본 포인트.
2. **핵심 완성:** Task 7~8 — 독립 검증, 추가 포인트, 다음 배송 가이드.
3. **발표 완성:** Task 9 — 실제 기사와 다음 기사 화면.
4. **제출 완성:** Task 10 — E2E와 배포 URL.

사진의 얼굴·번호판을 실제 픽셀 단위로 블러해 파일 자체를 보존하는 기능은 MVP 범위 밖이다. MVP에서는 원본 사진을 저장하지 않고 Gemini가 추출한 비식별 운영 지식만 저장한다. 이 결정은 개인정보 비저장 원칙을 지키면서 핵심 가설을 가장 빠르게 시연하기 위한 것이다.
