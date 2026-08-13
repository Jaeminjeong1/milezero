import { describe, expect, it } from "vitest";

import { InMemoryKnowledgeStore } from "@/storage/in-memory-store";

import { BackendPipeline } from "./pipeline";

const placeId = "place-mz-tower";
const selectedAnswers = [
  {
    questionId: "friction_type",
    question: "오늘 이 배송에서 불편한 점이 있었나요?",
    choice: "출입구를 찾기 어려웠어요",
  },
];

function createPipeline(store = new InMemoryKnowledgeStore()) {
  return {
    store,
    pipeline: new BackendPipeline({
      store,
      generateQuestion: async () => ({
        shouldAsk: true,
        category: "PARKING",
        questions: [
          {
            id: "friction_type",
            question: "차량을 세우거나 짐을 내릴 때 불편한 점이 있었나요?",
            choices: [
              "정차 공간이 부족했어요",
              "하역 공간이 부족했어요",
              "출입구가 멀었어요",
              "불편하지 않았어요",
            ],
          },
        ],
      }),
      generateKnowledge: async () => ({
        sanitizedSummary: "1톤 차량은 후문으로 진입해야 합니다.",
        removedPiiTypes: [],
        claims: [
          {
            type: "ENTRANCE_RECOMMENDATION",
            value: "1톤 차량은 후문으로 진입",
            vehicleType: "1TON",
            timeCondition: null,
          },
        ],
      }),
      matchClaim: async (candidate, existing) => {
        const match = existing.find(
          (claim) =>
            claim.type === candidate.type && claim.value === candidate.value,
        );
        return match
          ? { relation: "SUPPORTS" as const, targetClaimId: match.id }
          : { relation: "NEW" as const, targetClaimId: null };
      },
    }),
  };
}

describe("MileZero 백엔드 파이프라인", () => {
  it("GPS 마찰을 문제 맥락에 맞는 질문으로 연결한다", async () => {
    const { pipeline } = createPipeline();
    const result = await pipeline.createQuestionFromGps([
      { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 0 },
      { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 60_000 },
      { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 120_000 },
      { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 180_000 },
      { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 240_000 },
      { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 300_000 },
      { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 360_000 },
      { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 420_000 },
    ]);

    expect(result?.category).toBe("PARKING");
    expect(result?.questions[0]?.choices).toContain("불편하지 않았어요");
  });

  it("제보 즉시 기본 포인트를 주고 후보 지식만 저장한다", async () => {
    const { pipeline, store } = createPipeline();
    const receipt = await pipeline.submitContribution({
      idempotencyKey: "submission-basic",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: {
        answers: selectedAnswers,
        text: "010-1234-5678로 연락하고 1톤 차량은 후문으로 진입하세요.",
      },
    });

    expect(receipt.awardedPoints).toBe(10);
    expect(receipt.claimStatuses).toEqual(["CANDIDATE"]);
    expect(JSON.stringify(store.snapshot())).not.toContain("010-1234-5678");
  });

  it("추출할 운영 지식이 없는 응답에는 저장과 포인트를 수행하지 않는다", async () => {
    const store = new InMemoryKnowledgeStore();
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => ({
        shouldAsk: true,
        category: "OTHER",
        questions: [
          {
            id: "friction_type",
            question: "오늘 이 배송에서 불편한 점이 있었나요?",
            choices: [
              "다른 기사에게 알려줄 점이 있어요",
              "정차가 어려웠어요",
              "내부 이동이 어려웠어요",
              "불편하지 않았어요",
            ],
          },
        ],
      }),
      generateKnowledge: async () => ({
        sanitizedSummary: "불편하지 않았습니다.",
        removedPiiTypes: [],
        claims: [],
      }),
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });

    await expect(
      pipeline.submitContribution({
        idempotencyKey: "submission-empty",
        placeId,
        driverId: "driver-a",
        vehicleType: "1TON",
        contribution: {
          answers: [{ ...selectedAnswers[0], choice: "불편하지 않았어요" }],
        },
      }),
    ).rejects.toThrow(/저장할 배송지 운영 지식/);
    expect(await store.getPointBalance("driver-a")).toBe(0);
    expect(store.snapshot().reports).toHaveLength(0);
  });

  it("후보는 독립 확인 카드로만 보여주고 확인 후 정식 가이드로 승격한다", async () => {
    const { pipeline } = createPipeline();
    await pipeline.submitContribution({
      idempotencyKey: "submission-guide",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers, text: "1톤 차량은 후문으로 진입하세요." },
    });

    const before = await pipeline.getDeliveryKnowledge({
      placeId,
      driverId: "driver-b",
      vehicleType: "1TON",
    });
    expect(before.items).toEqual([]);
    expect(before.pendingConfirmation?.text).toContain("후문");

    await pipeline.recordFeedback({
      claimId: before.pendingConfirmation!.claimId,
      driverId: "driver-b",
      feedback: "CONFIRM",
    });

    const after = await pipeline.getDeliveryKnowledge({
      placeId,
      driverId: "driver-c",
      vehicleType: "1TON",
    });
    expect(after.pendingConfirmation).toBeNull();
    expect(after.items).toEqual([
      expect.objectContaining({ text: "1톤 차량은 후문으로 진입" }),
    ]);
  });

  it("제보자는 자기 지식을 검증할 수 없고 독립 검증 때 추가 포인트를 받는다", async () => {
    const { pipeline, store } = createPipeline();
    const report = await pipeline.submitContribution({
      idempotencyKey: "submission-self-verify",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers, text: "1톤 차량은 후문으로 진입하세요." },
    });
    const claimId = report.claimIds[0];

    await expect(
      pipeline.recordFeedback({
        claimId,
        driverId: "driver-a",
        feedback: "CONFIRM",
      }),
    ).rejects.toThrow(/독립 기사/);

    await pipeline.recordFeedback({
      claimId,
      driverId: "driver-b",
      feedback: "CONFIRM",
    });
    expect(await store.getPointBalance("driver-a")).toBe(30);
  });

  it("도움됨은 보상하지만 사실 확인을 대신하지 않는다", async () => {
    const { pipeline, store } = createPipeline();
    const report = await pipeline.submitContribution({
      idempotencyKey: "submission-helpful",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers, text: "1톤 차량은 후문으로 진입하세요." },
    });

    const result = await pipeline.recordFeedback({
      claimId: report.claimIds[0],
      driverId: "driver-b",
      feedback: "HELPFUL",
    });

    expect(result.status).toBe("CANDIDATE");
    expect(await store.getPointBalance("driver-a")).toBe(15);
  });

  it("같은 기사의 사실과 유용성 피드백을 한 건씩만 받는다", async () => {
    const { pipeline } = createPipeline();
    const report = await pipeline.submitContribution({
      idempotencyKey: "submission-feedback-dimensions",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers },
    });
    const claimId = report.claimIds[0];

    const fact = await pipeline.recordFeedback({
      claimId,
      driverId: "driver-b",
      feedback: "CONFIRM",
    });
    const utility = await pipeline.recordFeedback({
      claimId,
      driverId: "driver-b",
      feedback: "NOT_HELPFUL",
    });
    const repeatedFact = await pipeline.recordFeedback({
      claimId,
      driverId: "driver-b",
      feedback: "CONTRADICT",
    });
    const repeatedUtility = await pipeline.recordFeedback({
      claimId,
      driverId: "driver-b",
      feedback: "HELPFUL",
    });

    expect(fact.accepted).toBe(true);
    expect(utility).toEqual(
      expect.objectContaining({
        accepted: true,
        status: "VERIFIED",
        notHelpfulCount: 1,
        utilityScore: 0.35,
      }),
    );
    expect(repeatedFact.accepted).toBe(false);
    expect(repeatedUtility.accepted).toBe(false);
  });

  it("피드백은 중복이어도 누락된 보상을 멱등하게 복구한다", async () => {
    class FailOncePointStore extends InMemoryKnowledgeStore {
      private failed = false;

      override async awardPoints(
        entry: Parameters<InMemoryKnowledgeStore["awardPoints"]>[0],
      ) {
        if (entry.reason === "CLAIM_VERIFIED" && !this.failed) {
          this.failed = true;
          throw new Error("temporary point failure");
        }
        return super.awardPoints(entry);
      }
    }

    const store = new FailOncePointStore();
    const { pipeline } = createPipeline(store);
    const report = await pipeline.submitContribution({
      idempotencyKey: "submission-retry",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers, text: "1톤 차량은 후문으로 진입하세요." },
    });
    const feedback = {
      claimId: report.claimIds[0],
      driverId: "driver-b",
      feedback: "CONFIRM" as const,
    };

    await expect(pipeline.recordFeedback(feedback)).rejects.toThrow(
      "temporary point failure",
    );
    expect(await store.getPointBalance("driver-a")).toBe(10);

    const retried = await pipeline.recordFeedback(feedback);
    expect(retried.accepted).toBe(false);
    expect(retried.status).toBe("VERIFIED");
    expect(await store.getPointBalance("driver-a")).toBe(30);
  });

  it("서로 다른 두 기사가 사실이 아니라고 하면 충돌 상태로 바꾼다", async () => {
    const { pipeline } = createPipeline();
    const report = await pipeline.submitContribution({
      idempotencyKey: "submission-conflict",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers, text: "1톤 차량은 후문으로 진입하세요." },
    });

    await pipeline.recordFeedback({
      claimId: report.claimIds[0],
      driverId: "driver-b",
      feedback: "CONTRADICT",
    });
    const result = await pipeline.recordFeedback({
      claimId: report.claimIds[0],
      driverId: "driver-c",
      feedback: "CONTRADICT",
    });

    expect(result.status).toBe("CONFLICT");
  });

  it("충돌 지식과 연결된 새 수정 제보는 다시 후보로 저장한다", async () => {
    const { pipeline, store } = createPipeline();
    const report = await pipeline.submitContribution({
      idempotencyKey: "submission-conflict-replacement",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers },
    });
    const conflictedClaimId = report.claimIds[0];
    await pipeline.recordFeedback({
      claimId: conflictedClaimId,
      driverId: "driver-b",
      feedback: "CONTRADICT",
    });
    await pipeline.recordFeedback({
      claimId: conflictedClaimId,
      driverId: "driver-c",
      feedback: "CONTRADICT",
    });

    const correctionPipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => ({
        sanitizedSummary: "하역장이 지하 3층으로 변경됐습니다.",
        removedPiiTypes: [],
        claims: [
          {
            type: "ENTRANCE_RECOMMENDATION",
            value: "후문 진입 후 B3 하역장 이용",
            vehicleType: "1TON",
            timeCondition: null,
          },
        ],
      }),
      matchClaim: async (_candidate, existing) => ({
        relation: "CONTRADICTS",
        targetClaimId: existing.find((claim) => claim.id === conflictedClaimId)!.id,
      }),
    });
    const correction = await correctionPipeline.submitContribution({
      idempotencyKey: "submission-correction-candidate",
      placeId,
      driverId: "driver-d",
      vehicleType: "1TON",
      contribution: { answers: selectedAnswers },
    });

    expect(correction.claimIds).not.toContain(conflictedClaimId);
    expect(correction.claimStatuses).toEqual(["CANDIDATE"]);
    expect(store.snapshot().claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "후문 진입 후 B3 하역장 이용",
          status: "CANDIDATE",
        }),
      ]),
    );
  });

  it("같은 멱등 키 재전송은 Gemini를 다시 호출하거나 포인트를 중복 지급하지 않는다", async () => {
    const store = new InMemoryKnowledgeStore();
    let analysisCalls = 0;
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => {
        analysisCalls += 1;
        return {
          sanitizedSummary: "1톤 차량은 후문으로 진입합니다.",
          removedPiiTypes: [],
          claims: [
            {
              type: "ENTRANCE_RECOMMENDATION",
              value: "1톤 차량은 후문으로 진입",
              vehicleType: "1TON",
              timeCondition: null,
            },
          ],
        };
      },
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const input = {
      idempotencyKey: "submission-duplicate",
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON" as const,
      contribution: { answers: selectedAnswers, text: "후문으로 진입합니다." },
    };

    const first = await pipeline.submitContribution(input);
    const second = await pipeline.submitContribution(input);

    expect(second).toEqual(first);
    expect(analysisCalls).toBe(1);
    expect(await store.getPointBalance("driver-a")).toBe(10);
    expect(store.snapshot().reports).toHaveLength(1);
  });
});
