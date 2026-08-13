# Dynamic Delivery Guide UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Show the next driver only sanitized, independently verified knowledge from a previous driver's report and improve the guide/feedback UI hierarchy.

**Architecture:** Extend the existing `/v1/knowledge` item contract with safe claim metadata already stored in the knowledge database. The frontend renders all guide content and tags from that response, while the feedback sheet receives the displayed guide as context and keeps fact and utility feedback as separate steps.

**Tech Stack:** TypeScript, Fastify, React 19, Vitest, Testing Library, CSS

**Spec:** User-approved design in the 2026-08-13 Codex task

## Global Constraints

- Never expose reporter identity or raw report input to another driver.
- Only `VERIFIED` claims may appear in `items`; candidates stay in `pendingConfirmation`.
- A reporter must not receive their own claim as delivery guidance.
- Preserve the existing PII sanitization and independent verification rules.
- Use conventional Korean commit messages.

---

### Task 1: Verified knowledge response contract

**Files:**
- Modify: `backend/src/pipeline/pipeline.ts`
- Test: `backend/src/pipeline/pipeline.test.ts`
- Modify: `frontend/src/types.ts`
- Test: `backend/src/server/dependencies.test.ts`

**Interfaces:**
- Consumes: `StoredClaim` fields `type`, `value`, `vehicleType`, `timeCondition`, `confidence`, `createdAt`
- Produces: `DeliveryKnowledgeItem` with `claimId`, `text`, `type`, `vehicleType`, `timeCondition`, `confidence`, `reportedAt`

- [x] **Step 1: Write failing backend tests**

```ts
expect(after.items[0]).toMatchObject({
  text: "1톤 차량은 후문으로 진입",
  type: "ENTRANCE_RECOMMENDATION",
  vehicleType: "1TON",
  timeCondition: null,
});
expect(ownKnowledge.items).toEqual([]);
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `corepack pnpm --filter @milezero/backend test -- src/pipeline/pipeline.test.ts`

- [x] **Step 3: Map safe metadata and exclude the reporter**

```ts
items: verified
  .filter((claim) => claim.reporterId !== input.driverId)
  .slice(0, 5)
  .map((claim) => ({
    claimId: claim.id,
    text: claim.value,
    type: claim.type,
    vehicleType: claim.vehicleType,
    timeCondition: claim.timeCondition,
    confidence: claim.confidence,
    reportedAt: claim.createdAt,
  }))
```

- [x] **Step 4: Run backend tests and typecheck**

Run: `corepack pnpm --filter @milezero/backend test && corepack pnpm --filter @milezero/backend typecheck`

- [x] **Step 5: Commit**

```bash
git add backend/src/pipeline/pipeline.ts backend/src/pipeline/pipeline.test.ts backend/src/server/dependencies.test.ts frontend/src/types.ts docs/superpowers/plans/2026-08-13-dynamic-guide-ui.md
git commit -m "feat: 검증된 기사 제보의 안내 메타데이터 제공"
```

### Task 2: Data-driven guide card

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/GuideCard.tsx`
- Modify: `frontend/src/styles/global.css`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `DeliveryKnowledgeItem`
- Produces: guide card with dynamic claim label, vehicle condition, time condition, confidence, and verified-source copy

- [x] **Step 1: Write failing UI assertions**

```ts
expect(screen.getByText("추천 진입 경로")).toBeVisible();
expect(screen.getByText("승합차")).toBeVisible();
expect(screen.queryByText("합성 시나리오")).not.toBeInTheDocument();
```

- [x] **Step 2: Run the focused frontend test and verify it fails**

Run: `corepack pnpm --filter @milezero/frontend test -- src/App.test.tsx`

- [x] **Step 3: Render the complete item instead of fixed metadata**

```tsx
<GuideCard
  guide={receiver.guide}
  completed={receiver.phase !== "guide_ready"}
  onCompleteDelivery={receiver.completeDelivery}
/>
```

- [x] **Step 4: Refine spacing, typography, source badge, and responsive tags**

Use existing design tokens and keep the primary delivery-complete CTA at least 54px high.

- [x] **Step 5: Run frontend tests and typecheck**

Run: `corepack pnpm --filter @milezero/frontend test && corepack pnpm --filter @milezero/frontend typecheck`

- [x] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/GuideCard.tsx frontend/src/styles/global.css frontend/src/App.test.tsx
git commit -m "feat: 기사 제보 기반 동적 배송 가이드 개선"
```

### Task 3: Contextual two-step feedback sheet

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ReceiverFeedbackSheet.tsx`
- Modify: `frontend/src/styles/global.css`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: the `text` of the exact guide being evaluated and `ReceiverPhase`
- Produces: compact `1/2 사실 확인` and `2/2 도움 확인` dialog states

- [x] **Step 1: Write failing UI assertions**

```ts
expect(screen.getByText("1/2 · 사실 확인")).toBeVisible();
expect(screen.getByText(displayedGuideText)).toBeVisible();
expect(screen.getByText("2/2 · 도움 확인")).toBeVisible();
```

- [x] **Step 2: Run the focused frontend test and verify it fails**

Run: `corepack pnpm --filter @milezero/frontend test -- src/App.test.tsx`

- [x] **Step 3: Add the guide context and step labels**

```tsx
<ReceiverFeedbackSheet
  guideText={receiver.guide.text}
  phase={receiver.phase}
  loading={receiver.feedbackLoading}
  completionMessage={receiver.completionMessage}
  onFact={receiver.answerFact}
  onUtility={receiver.answerUtility}
/>
```

- [x] **Step 4: Reduce oversized whitespace and strengthen mobile actions**

Keep the sheet content compact, add a quoted guide context surface, and retain two equal-width action buttons.

- [x] **Step 5: Run full verification**

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm build && corepack pnpm qa:demo`

- [x] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/ReceiverFeedbackSheet.tsx frontend/src/styles/global.css frontend/src/App.test.tsx
git commit -m "feat: 배송 가이드 사실 도움 피드백 UI 개선"
```
