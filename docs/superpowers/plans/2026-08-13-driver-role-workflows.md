# MileZero Driver Role Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 심사 웹앱을 `등록하는 기사`와 `도움 받는 기사` 두 역할로 재구성하고, 1~2개 LLM 질문부터 사실·유용성 피드백과 충돌 지식 교체까지 백엔드 계약으로 지원한다.

**Architecture:** 백엔드는 질문 배열, 선택형 답변 배열과 두 차원의 피드백 계약을 제공한다. 프런트엔드는 등록 흐름과 도움 흐름을 별도 훅으로 관리하며, 데모 저장소에는 검증된 지식을 미리 준비해 도움 흐름을 독립적으로 시연한다.

**Tech Stack:** Node.js 22, TypeScript, Zod, Fastify, Gemini API, Supabase/PostgreSQL, React 19, Vite, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-13-driver-role-workflows-design.md`

## Global Constraints

- 상단 탭의 사용자 노출 명칭은 정확히 `등록하는 기사`, `도움 받는 기사`다.
- 두 탭 모두 `마지막 구간은 현장 경험이 안내할게요.`를 표시한다.
- 질문은 1~2개이고 각 질문은 4~5개 선택지를 가진다.
- 첫 질문은 `불편하지 않았어요` 중립 선택지를 포함하며 기사 책임을 묻지 않는다.
- 추가 텍스트·음성·사진은 선택 입력이고 선택형 답변만으로 제보할 수 있다.
- 원본 GPS 좌표와 원본 미디어를 영구 저장하지 않는다.
- 개인정보 발견 시 재질문하지 않고 해당 부분만 제거한다.
- 독립 `CONTRADICT` 2건에서 기존 지식은 `CONFLICT`가 되어 안내에서 제외된다.
- `NOT_HELPFUL`만으로 사실 상태를 변경하지 않는다.
- 모든 커밋 메시지는 Conventional Commits 형식의 한국어로 작성한다.

---

### Task 1: LLM 다단계 질문 계약

**Files:**
- Modify: `backend/src/domain/contracts.ts`
- Modify: `backend/src/domain/contracts.test.ts`
- Modify: `backend/src/questions/planner.ts`
- Modify: `backend/src/questions/planner.test.ts`
- Modify: `backend/src/gemini/gateway.ts`
- Modify: `backend/src/gemini/gateway.test.ts`
- Modify: `backend/src/demo/gateway.ts`

**Interfaces:**
- Produces: `QuestionItem = { id: string; question: string; choices: string[] }`
- Produces: `QuestionPlan = { shouldAsk; category; questions: QuestionItem[] }`
- Guarantees: `questions.length` is 1 or 2 and every `choices.length` is 4 or 5

- [ ] **Step 1: Write failing schema and fallback tests**

```ts
it("1~2개 질문과 질문별 4~5개 선택지만 허용한다", () => {
  const valid = QuestionPlanSchema.parse({
    shouldAsk: true,
    category: "ENTRANCE",
    questions: [{
      id: "friction",
      question: "오늘 이 배송에서 불편한 점이 있었나요?",
      choices: ["출입구", "정차", "내부 이동", "불편하지 않았어요"],
    }],
  });
  expect(valid.questions).toHaveLength(1);
  expect(() => QuestionPlanSchema.parse({ ...valid, questions: [] })).toThrow();
  expect(() => QuestionPlanSchema.parse({
    ...valid,
    questions: [{ ...valid.questions[0], choices: ["하나", "둘", "불편하지 않았어요"] }],
  })).toThrow();
});
```

Add a planner test where the model returns a blaming or malformed plan and assert that fallback contains one or two questions, four choices each, and the neutral choice in the first question.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @milezero/backend exec vitest run src/domain/contracts.test.ts src/questions/planner.test.ts`

Expected: FAIL because `questions` does not exist and the old schema accepts a single `question`/`choices` pair.

- [ ] **Step 3: Implement question array schema, prompts and deterministic demo**

Use this shape in `contracts.ts`:

```ts
export const QuestionItemSchema = z.object({
  id: z.string().min(1).max(40),
  question: z.string().min(1).max(120),
  choices: z.array(z.string().min(1).max(50)).min(4).max(5),
});

export const QuestionPlanSchema = z.object({
  shouldAsk: z.boolean(),
  category: FrictionCategorySchema,
  questions: z.array(QuestionItemSchema).min(1).max(2),
}).superRefine((plan, context) => {
  for (const [index, item] of plan.questions.entries()) {
    if (BLAMING_PATTERN.test(`${item.question} ${item.choices.join(" ")}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", index],
        message: "기사 책임을 묻는 표현은 사용할 수 없습니다.",
      });
    }
  }

  if (!plan.questions[0]?.choices.includes("불편하지 않았어요")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["questions", 0, "choices"],
      message: "첫 질문에는 중립 선택지가 필요합니다.",
    });
  }
});
```

Update Gemini system instruction to request one primary question and at most one context-specific follow-up. Update every fallback and demo gateway to return the new structure with stable IDs `friction_type` and `actionable_detail`.

- [ ] **Step 4: Verify GREEN and Gemini JSON schema**

Run: `corepack pnpm --filter @milezero/backend exec vitest run src/domain/contracts.test.ts src/questions/planner.test.ts src/gemini/gateway.test.ts`

Expected: PASS; Gemini test confirms `responseJsonSchema` describes `questions` rather than top-level `question`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain backend/src/questions backend/src/gemini backend/src/demo/gateway.ts
git commit -m "feat: LLM 다단계 선택 질문 계약 추가"
```

### Task 2: 선택형 답변 기반 제보 분석

**Files:**
- Modify: `backend/src/knowledge/analyzer.ts`
- Modify: `backend/src/knowledge/analyzer.test.ts`
- Modify: `backend/src/gemini/gateway.ts`
- Modify: `backend/src/gemini/gateway.test.ts`
- Modify: `backend/src/pipeline/pipeline.test.ts`
- Modify: `backend/src/server/server.ts`
- Modify: `backend/src/server/server.test.ts`
- Modify: `backend/src/demo/scenario.ts`

**Interfaces:**
- Consumes: `QuestionAnswer = { questionId: string; question: string; choice: string }`
- Produces: `ContributionInput = { answers: QuestionAnswer[]; text?; media? }`
- API: `POST /v1/reports contribution.answers` contains 1 or 2 answers

- [ ] **Step 1: Write failing analyzer and API tests**

```ts
it("추가 설명 없이 선택형 답변만 분석한다", async () => {
  const generate = vi.fn(async () => ({
    sanitizedSummary: "후문 진입이 필요합니다.",
    removedPiiTypes: [],
    claims: [claimFixture],
  }));
  await analyzeContribution({
    answers: [{
      questionId: "friction_type",
      question: "어떤 불편이 있었나요?",
      choice: "출입구를 찾기 어려웠어요",
    }],
  }, generate);
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({
    answers: expect.arrayContaining([expect.objectContaining({ choice: "출입구를 찾기 어려웠어요" })]),
  }));
});
```

Add server tests that accept one/two valid answers without text/media and reject zero answers, three answers, blank IDs and answers longer than 120 characters.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @milezero/backend exec vitest run src/knowledge/analyzer.test.ts src/server/server.test.ts`

Expected: FAIL because only `answerChoice` is accepted and text/media is currently required.

- [ ] **Step 3: Implement answer arrays through API, analyzer and Gemini**

Replace `answerChoice` with:

```ts
answers: Array<{
  questionId: string;
  question: string;
  choice: string;
}>;
```

Sanitize every `question` and `choice` before the Gemini call, pass them as `answers`, and include them in the Gemini knowledge extraction prompt. Keep text/media privacy handling unchanged. Update the HTTP schema to require 1~2 strict answer objects while text/media remain optional.

- [ ] **Step 4: Verify GREEN and the complete demo API scenario**

Run: `corepack pnpm --filter @milezero/backend exec vitest run src/knowledge/analyzer.test.ts src/gemini/gateway.test.ts src/pipeline/pipeline.test.ts src/server/server.test.ts src/demo/scenario.test.ts`

Expected: PASS and the demo report receives 10P using `answers` plus its privacy-containing optional text.

- [ ] **Step 5: Commit**

```bash
git add backend/src/knowledge backend/src/gemini backend/src/pipeline backend/src/server backend/src/demo
git commit -m "feat: 선택형 답변 기반 제보 분석 연결"
```

### Task 3: 사실·유용성 피드백과 충돌 지식 저장

**Files:**
- Modify: `backend/src/validation/evaluator.ts`
- Modify: `backend/src/validation/evaluator.test.ts`
- Modify: `backend/src/storage/contracts.ts`
- Modify: `backend/src/storage/in-memory-store.ts`
- Modify: `backend/src/storage/supabase-store.ts`
- Modify: `backend/src/storage/supabase-store.test.ts`
- Modify: `backend/src/storage/migration.test.ts`
- Modify: `backend/src/pipeline/pipeline.ts`
- Modify: `backend/src/pipeline/pipeline.test.ts`
- Modify: `backend/src/server/server.ts`
- Modify: `backend/src/server/server.test.ts`
- Modify: `backend/supabase/migrations/202608130001_milezero_pipeline.sql`
- Modify: `backend/src/server/dependencies.ts`
- Modify: `backend/src/server/dependencies.test.ts`
- Modify: `backend/src/demo/scenario.ts`
- Modify: `backend/src/demo/scenario.test.ts`

**Interfaces:**
- Extends: `FeedbackType` with `NOT_HELPFUL`
- Extends: `StoredClaim` with `notHelpfulCount: number`, `utilityScore: number`
- Produces: `Evaluation = { status; confidence; helpfulCount; notHelpfulCount; utilityScore }`
- Demo: `demo-office-tower` has a seeded verified guide for `demo-driver-b`

- [ ] **Step 1: Write failing evaluator and duplicate-dimension tests**

```ts
it("유용성 피드백은 사실 상태와 분리한다", () => {
  expect(evaluateClaim("reporter", [
    { driverId: "b", feedback: "NOT_HELPFUL" },
  ])).toEqual(expect.objectContaining({
    status: "CANDIDATE",
    helpfulCount: 0,
    notHelpfulCount: 1,
    utilityScore: 0.35,
  }));
});

it("독립 변경 신호 두 건이면 검증 지식을 중단한다", () => {
  expect(evaluateClaim("reporter", [
    { driverId: "seed-verifier", feedback: "CONFIRM" },
    { driverId: "b", feedback: "CONTRADICT" },
    { driverId: "c", feedback: "CONTRADICT" },
  ]).status).toBe("CONFLICT");
});
```

Add store tests proving the same driver can submit one FACT and one UTILITY record, while a second record in either dimension is rejected.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @milezero/backend exec vitest run src/validation/evaluator.test.ts src/pipeline/pipeline.test.ts src/storage/migration.test.ts`

Expected: FAIL because `NOT_HELPFUL`, utility fields and the utility uniqueness boundary do not exist.

- [ ] **Step 3: Implement feedback dimensions and persisted utility fields**

Use these feedback dimensions:

```ts
const FACT = new Set(["CONFIRM", "CONTRADICT"]);
const UTILITY = new Set(["HELPFUL", "NOT_HELPFUL"]);
```

Compute `utilityScore = clamp(0.5 + helpfulCount * 0.1 - notHelpfulCount * 0.15)`. Add `not_helpful_count integer default 0` and `utility_score numeric(4,3) default 0.5` to `claims`. Replace the single evidence uniqueness rule with one partial unique index for FACT and another for UTILITY. Extend Supabase row schemas and update RPC payloads.

- [ ] **Step 4: Seed verified demo knowledge and verify guide filtering**

Add constructor seed input to `InMemoryKnowledgeStore` and create a demo store containing:

```ts
{
  id: "demo-guide-claim",
  reporterId: "demo-knowledge-reporter",
  status: "VERIFIED",
  value: "1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요",
  confidence: 0.75,
  helpfulCount: 2,
  notHelpfulCount: 0,
  utilityScore: 0.7,
}
```

Seed one independent `CONFIRM` evidence so refreshing the claim preserves VERIFIED. Verify `/v1/knowledge` returns the seeded guide, then after two different drivers submit `CONTRADICT` it no longer appears.

- [ ] **Step 5: Verify GREEN and migration behavior**

Run: `corepack pnpm --filter @milezero/backend test`

Expected: PASS; migration applies in PGlite, feedback dimensions are independently idempotent, `NOT_HELPFUL` does not change fact status, and two contradictions hide the guide.

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/supabase
git commit -m "feat: 사실과 유용성 기반 지식 갱신 추가"
```

### Task 4: 등록하는 기사 프런트 흐름

**Files:**
- Create: `frontend/src/components/RoleHero.tsx`
- Create: `frontend/src/components/ReporterProgress.tsx`
- Create: `frontend/src/hooks/useReporterJourney.ts`
- Create: `frontend/src/hooks/useReporterJourney.test.tsx`
- Modify: `frontend/src/components/TopTabs.tsx`
- Modify: `frontend/src/components/StatusCard.tsx`
- Modify: `frontend/src/components/QuestionSheet.tsx`
- Modify: `frontend/src/components/ContributionSheet.tsx`
- Modify: `frontend/src/components/RewardSheet.tsx`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/api.test.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/styles/global.css`
- Delete: `frontend/src/hooks/useDemoJourney.ts`
- Delete: `frontend/src/hooks/useDemoJourney.test.tsx`

**Interfaces:**
- Produces: `ReporterPhase = delivering | friction_detected | loading_questions | asking | optional_detail | submitting | rewarded | no_issue | error`
- Produces: `useReporterJourney(api, { autoDetectDelayMs })`
- Produces: `completeDelivery()`, `selectAnswer(choice)`, `submitContribution({ text?, file? })`

- [ ] **Step 1: Write failing role tabs and reporter journey tests**

```tsx
it("배송 완료 전에는 질문을 열지 않는다", async () => {
  const api = createApiWithTwoQuestions();
  const { result } = renderHook(() => useReporterJourney(api, { autoDetectDelayMs: 0 }));
  await waitFor(() => expect(result.current.phase).toBe("friction_detected"));
  expect(api.createQuestion).not.toHaveBeenCalled();
  await act(() => result.current.completeDelivery());
  expect(api.createQuestion).toHaveBeenCalledOnce();
  expect(result.current.phase).toBe("asking");
});
```

Add App tests for exact tab labels, common hero in both tabs, visible workflow steps, first/second question progression, neutral exit, and a selection-only report request with no text/media.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @milezero/frontend exec vitest run src/App.test.tsx src/hooks/useReporterJourney.test.tsx`

Expected: FAIL because current tabs use delivery dates, questions auto-open before completion, and the contribution CTA requires text/file.

- [ ] **Step 3: Implement role shell and reporter state machine**

Rename `DeliveryTab` values to `reporter | receiver`. Render `RoleHero` above each role body. Auto timer only marks friction detected. `배송 완료했어요` calls `/v1/questions`, then `QuestionSheet` receives one `QuestionItem` and a `1/2` progress label. Keep selected answers in order.

If the first answer is `불편하지 않았어요`, enter `no_issue` without calling `/v1/reports`. Otherwise finish one/two questions and open optional detail. `ContributionSheet` must enable `선택 답변만 보내고 10P 받기` even when text/file is empty.

- [ ] **Step 4: Update typed API client and verify GREEN**

Map frontend `QuestionPlan`, `ReportInput` and `createApiClient` to the backend contract. Verify the request body contains `answers` and never raw GPS coordinates.

Run: `corepack pnpm --filter @milezero/frontend test`

Expected: PASS for tabs, role hero, delivery completion boundary, two questions, optional detail and immediate reward.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: 등록하는 기사 다단계 제보 흐름 구현"
```

### Task 5: 도움 받는 기사 안내와 사후 피드백

**Files:**
- Create: `frontend/src/components/ReceiverProgress.tsx`
- Create: `frontend/src/components/ReceiverFeedbackSheet.tsx`
- Create: `frontend/src/hooks/useReceiverJourney.ts`
- Create: `frontend/src/hooks/useReceiverJourney.test.tsx`
- Modify: `frontend/src/components/GuideCard.tsx`
- Modify: `frontend/src/components/PointsSummary.tsx`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Produces: `ReceiverPhase = idle | loading_guide | guide_ready | fact_feedback | utility_feedback | feedback_complete | error`
- Produces: `openGuide()`, `completeDelivery()`, `answerFact()`, `answerUtility()`, `retryFeedback()`
- Calls: FACT API once and UTILITY API once for `demo-driver-b`

- [ ] **Step 1: Write failing receiver state tests**

```tsx
it("안내를 먼저 보여주고 배송 완료 후 두 피드백을 순서대로 받는다", async () => {
  const api = createApiWithVerifiedGuide();
  const { result } = renderHook(() => useReceiverJourney(api));
  await act(() => result.current.openGuide());
  expect(result.current.phase).toBe("guide_ready");
  act(() => result.current.completeDelivery());
  expect(result.current.phase).toBe("fact_feedback");
  await act(() => result.current.answerFact("CONFIRM"));
  expect(result.current.phase).toBe("utility_feedback");
  await act(() => result.current.answerUtility("HELPFUL"));
  expect(result.current.phase).toBe("feedback_complete");
});
```

Add a retry test where FACT succeeds and UTILITY fails; retry must send only the utility feedback. Add App tests for guide-before-feedback, `정보가 달랐어요`, `도움은 없었어요`, and the conflict policy explanation.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @milezero/frontend exec vitest run src/hooks/useReceiverJourney.test.tsx src/App.test.tsx`

Expected: FAIL because the current next-delivery flow asks candidate confirmation before showing a guide and has no separate completion/fact/utility steps.

- [ ] **Step 3: Implement receiver state machine and feedback UI**

Load only `knowledge.items[0]` for the receiver role. Add `배송 완료했어요` to `GuideCard`. `ReceiverFeedbackSheet` asks exact fact and utility questions one at a time. Send `CONFIRM`/`CONTRADICT`, then `HELPFUL`/`NOT_HELPFUL`, preserving completion of the first request if the second fails.

Display these completion messages:

```text
사실이고 도움됨: "다음 기사에게도 이 안내를 유지할게요."
사실이지만 도움 없음: "사실 정보는 유지하고 안내 우선순위를 조정할게요."
정보가 다름: "변경 신호를 저장했어요. 독립 확인 2건이면 안내를 중단해요."
```

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm --filter @milezero/frontend test`

Expected: PASS; guide is visible before completion and both feedback dimensions are submitted exactly once.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: 도움 받는 기사 사전 안내와 피드백 구현"
```

### Task 6: 통합 QA, 문서와 배포 검증

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-13-milezero-frontend-design.md`
- Modify: `docs/superpowers/plans/2026-08-13-driver-role-workflows.md`

**Interfaces:**
- Documents: role tabs, reporter journey, receiver journey, feedback threshold
- Verifies: one production URL serves SPA and API

- [ ] **Step 1: Update docs to the implemented role flows**

Replace the previous `오늘 배송`/`다음 배송` walkthrough with:

```text
등록하는 기사 → 마찰 감지 → 배송 완료 → 1~2개 선택 → 선택적 설명 → 10P
도움 받는 기사 → 사전 가이드 → 배송 완료 → 사실 확인 → 도움 확인 → 지식 유지/충돌
```

Document `NOT_HELPFUL`, two-independent-contradictions conflict threshold and the rule that conflict knowledge is not served.

- [ ] **Step 2: Run complete automated verification**

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm qa:demo
corepack pnpm audit --prod
```

Expected: all commands exit 0; demo QA reports privacy-safe storage, reporter 10P, seeded guide feedback and conflict filtering.

- [ ] **Step 3: Run production server smoke test**

Start `MILEZERO_MODE=demo PORT=3100 corepack pnpm --filter @milezero/backend start` and verify:

```text
GET / -> 200 text/html
GET /ready -> 200 { status: "ready" }
GET /v1/missing -> 404 application/json
```

- [ ] **Step 4: Run browser visual QA**

At 390×844 and 1280×900, complete both role flows. Verify exact role labels and common hero, no horizontal overflow, no console error, keyboard-accessible buttons, correct 1/2 question progress, guide-before-feedback order and the negative feedback completion message.

- [ ] **Step 5: Commit**

```bash
git add README.md docs
git commit -m "docs: 기사 역할별 심사 시연 흐름 정리"
```

- [ ] **Step 6: Final requirement audit**

Map every requirement in `docs/superpowers/specs/2026-08-13-driver-role-workflows-design.md` to a passing backend test, frontend test, runtime response or browser observation. Do not mark complete while any item lacks direct evidence.
