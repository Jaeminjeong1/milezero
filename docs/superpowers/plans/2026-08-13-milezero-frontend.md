# MileZero Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 없이 자동 마찰 감지부터 제보·독립 검증·다음 기사 가이드·도움 피드백까지 체험하는 카카오 T 스타일의 모바일 우선 심사 데모 웹앱을 만든다.

**Architecture:** React/Vite 클라이언트를 `src/client`에 추가하고 Fastify가 프로덕션 정적 파일과 API를 한 도메인에서 제공한다. 클라이언트는 타입 안전 API 계층과 단일 데모 여정 상태 훅으로 UI를 분리하며, 서버는 기본 Gemini/Supabase 모드와 명시적인 인메모리 합성 데모 모드를 지원한다.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Phosphor Icons, Fastify, `@fastify/static`

**Spec:** `docs/superpowers/specs/2026-08-13-milezero-frontend-design.md`

## Global Constraints

- 원본 GPS 좌표는 전송하지 않고 `FrictionFeatures` 집계값만 전송한다.
- 최종 CTA만 `#FAE100`, 상단 컨텍스트 탭은 `#3478F6`, 텍스트는 노랑 배경 위에서 `#191919`을 사용한다.
- 모바일 최대 폭은 480px, 최소 터치 영역은 44px, 간격은 4px 배수로 구성한다.
- 개인정보 발견 시 재질문하지 않고 제거 사실만 안내한다.
- `MILEZERO_MODE=demo`는 합성 데이터임을 표시하고 기본 운영 모드의 Gemini/Supabase 경로를 바꾸지 않는다.
- 기능 단위 커밋 메시지는 한국어로 작성한다.

---

### Task 1: 클라이언트 도구 체인과 API 경계

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Create: `vite.config.ts`
- Create: `src/client/api.ts`
- Create: `src/client/api.test.ts`
- Create: `src/client/test/setup.ts`
- Create: `src/client/types.ts`

**Interfaces:**
- Produces: `createApiClient({ baseUrl?, fetchImpl? }): MileZeroApi`
- Produces: `fileToMedia(file: File): Promise<{ mimeType: string; dataBase64: string }>`
- Produces: 공유 타입 `QuestionPlan`, `ReportReceipt`, `DeliveryKnowledge`, `FeedbackResult`

- [x] **Step 1: API 클라이언트 실패 테스트 작성** — `/v1/questions`가 집계 특징만 전송하고, 제보에 `x-driver-id` 및 idempotency key가 포함되며, 파일이 Data URL 접두사 없는 Base64로 변환되고, 비정상 응답이 `ApiError`가 되는 테스트를 작성한다.
- [x] **Step 2: RED 확인** — `pnpm vitest run src/client/api.test.ts`가 모듈 부재로 실패하는지 확인한다.
- [x] **Step 3: 최소 구현** — React/Vite/Testing Library 의존성과 jsdom 프로젝트 설정을 추가하고 `types.ts`, `api.ts`, Vite 프록시를 구현한다.
- [x] **Step 4: GREEN 확인** — API 테스트, 타입 검사, 기존 백엔드 테스트를 실행한다.
- [x] **Step 5: 커밋** — `git commit -m "프런트 기반: React 도구 체인과 API 경계 추가"`.

### Task 2: 디자인 토큰과 홈 셸

**Files:**
- Create: `index.html`
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/App.test.tsx`
- Create: `src/client/styles/tokens.css`
- Create: `src/client/styles/global.css`
- Create: `src/client/components/AppShell.tsx`
- Create: `src/client/components/TopTabs.tsx`
- Create: `src/client/components/DeliveryCard.tsx`
- Create: `src/client/components/StatusCard.tsx`

**Interfaces:**
- Consumes: `MileZeroApi`
- Produces: `<App api={api} autoDetectDelayMs={number} />`
- Produces: 재사용 가능한 앱 셸, 상단 탭, 배송 카드, 상태 카드

- [x] **Step 1: 홈 실패 테스트 작성** — 브랜드명, `오늘 배송`/`다음 배송`, 합성 데이터 배지, 현재 배송 카드, 개인정보 원칙, 재실행 버튼이 렌더링되는지 검증한다.
- [x] **Step 2: RED 확인** — `pnpm vitest run src/client/App.test.tsx`가 컴포넌트 부재로 실패하는지 확인한다.
- [x] **Step 3: 최소 구현** — 첨부 Kakao T 토큰, 반응형 앱 셸, Phosphor 아이콘 기반 홈을 구현한다.
- [x] **Step 4: GREEN 확인** — 컴포넌트 테스트와 타입 검사를 실행하고 44px 터치 크기를 CSS에서 검증한다.
- [x] **Step 5: 커밋** — `git commit -m "프런트 화면: 카카오 T 기반 홈과 디자인 토큰 구현"`.

### Task 3: 자동 마찰 감지와 멀티모달 제보

**Files:**
- Create: `src/client/hooks/useDemoJourney.ts`
- Create: `src/client/hooks/useDemoJourney.test.tsx`
- Create: `src/client/components/QuestionSheet.tsx`
- Create: `src/client/components/ContributionSheet.tsx`
- Create: `src/client/components/ProcessingSheet.tsx`
- Create: `src/client/components/RewardSheet.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles/global.css`

**Interfaces:**
- Produces: `useDemoJourney(api, { autoDetectDelayMs })`
- State: `detecting | question | contribution | submitting | rewarded | error`
- Actions: `replay`, `selectChoice`, `submitContribution`, `dismissReward`

- [x] **Step 1: 여정 실패 테스트 작성** — 타이머 뒤 질문 API 호출, 선택 후 제보 시트, 텍스트·사진 입력, 제출 중 네 단계, 성공 10포인트, 오류 재시도를 검증한다.
- [x] **Step 2: RED 확인** — 훅/시트 모듈 부재와 상태 전이 미구현으로 실패하는지 확인한다.
- [x] **Step 3: 최소 구현** — 자동 감지와 재실행, 바텀시트 포커스, 파일 8MB·MIME 검증, idempotency key 유지, 응답 완료 시 미디어 해제를 구현한다.
- [x] **Step 4: GREEN 확인** — 훅 및 앱 테스트를 실행하고 기존 서버 테스트도 회귀 확인한다.
- [x] **Step 5: 커밋** — `git commit -m "핵심 여정: 자동 감지와 멀티모달 제보 연결"`.

### Task 4: 독립 검증과 다음 기사 안내

**Files:**
- Create: `src/client/components/PendingKnowledgeCard.tsx`
- Create: `src/client/components/GuideCard.tsx`
- Create: `src/client/components/PointsSummary.tsx`
- Modify: `src/client/hooks/useDemoJourney.ts`
- Modify: `src/client/hooks/useDemoJourney.test.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`

**Interfaces:**
- Adds actions: `openNextDelivery`, `confirmPending(feedback)`, `rateGuide(feedback)`
- Uses hidden demo identities: reporter `demo-driver-a`, verifier `demo-driver-b`, guide consumer `demo-driver-c`

- [x] **Step 1: 검증 흐름 실패 테스트 작성** — 다음 배송 탭에서 후보 확인, `CONFIRM` 후 VERIFIED 안내, 다른 기사 조회, `HELPFUL` 후 35포인트 표시를 검증한다.
- [x] **Step 2: RED 확인** — 카드와 액션 부재로 실패하는지 확인한다.
- [x] **Step 3: 최소 구현** — 후보 카드, 확인 피드백, 신뢰도 가이드, 도움/달라짐 피드백, 누적 보상 요약을 구현한다.
- [x] **Step 4: GREEN 확인** — 전체 클라이언트 테스트와 접근 가능한 버튼 이름을 확인한다.
- [x] **Step 5: 커밋** — `git commit -m "검증 경험: 독립 확인과 다음 기사 가이드 구현"`.

### Task 5: 데모 런타임과 단일 URL 배포

**Files:**
- Create: `src/demo/gateway.ts`
- Create: `src/server/dependencies.ts`
- Create: `src/server/dependencies.test.ts`
- Modify: `src/server/main.ts`
- Modify: `src/server/server.ts`
- Modify: `src/server/server.test.ts`
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: `createDependencies(env): { pipeline; readiness }`
- `MILEZERO_MODE=demo` returns deterministic gateway + `InMemoryKnowledgeStore`
- `buildServer(..., { clientDistPath })` serves hashed assets and SPA fallback

- [x] **Step 1: 서버 실패 테스트 작성** — demo 모드가 외부 키 없이 생성되고, 기본 모드는 키를 요구하며, `/`가 클라이언트 HTML을 반환하고 `/v1/*` 404가 SPA로 대체되지 않는지 검증한다.
- [x] **Step 2: RED 확인** — 의존성 팩토리와 정적 서빙 부재로 실패하는지 확인한다.
- [x] **Step 3: 최소 구현** — 결정적 데모 gateway, 런타임 팩토리, `@fastify/static`, Vite+서버 통합 빌드, Docker client copy를 구현한다.
- [x] **Step 4: GREEN 확인** — 서버 테스트, `pnpm build`, `MILEZERO_MODE=demo pnpm start` readiness와 홈 smoke test를 실행한다.
- [x] **Step 5: 커밋** — `git commit -m "배포 통합: 데모 런타임과 단일 URL 서빙 추가"`.

### Task 6: 최종 브라우저 QA와 문서화

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-13-milezero-frontend.md`

**Interfaces:**
- Verification only; no new product API.

- [x] **Step 1: 전체 자동화 검증** — `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm qa:demo`, `pnpm audit --prod`를 실행한다.
- [x] **Step 2: 로컬 서버 브라우저 QA** — demo 모드 서버를 실행해 390px과 1280px에서 질문→제보→검증→도움됨을 조작하고 콘솔 오류, 가로 오버플로, 버튼 접근 이름을 확인한다.
- [x] **Step 3: 시각 결함 수정** — 발견한 결함마다 실패 테스트를 먼저 추가하고 수정한 뒤 관련 테스트를 재실행한다.
- [x] **Step 4: 문서 확정** — 로컬 demo/운영 실행법, 환경변수, 심사 시연 순서를 README에 기록한다.
- [x] **Step 5: 커밋** — `git commit -m "QA: 심사 데모 시연 경로와 실행 문서 확정"`.
- [x] **Step 6: 통합 검증과 푸시** — clean 상태에서 전체 검증 후 `main`에 병합하고 GitHub `main`을 푸시한다.
