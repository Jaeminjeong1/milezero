import { describe, expect, it } from "vitest";

import { InMemoryKnowledgeStore } from "@/storage/in-memory-store";

import { BackendPipeline } from "./pipeline";

const placeId = "place-mz-tower";

function createPipeline(store = new InMemoryKnowledgeStore()) {
  return {
    store,
    pipeline: new BackendPipeline({
      store,
      generateQuestion: async () => ({
        shouldAsk: true,
        category: "PARKING",
        question: "차량을 세우거나 짐을 내릴 때 불편한 점이 있었나요?",
        choices: ["정차 공간이 부족했어요", "불편하지 않았어요"],
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
    expect(result?.choices).toContain("불편하지 않았어요");
  });

  it("제보 즉시 기본 포인트를 주고 후보 지식만 저장한다", async () => {
    const { pipeline, store } = createPipeline();
    const receipt = await pipeline.submitContribution({
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: {
        answerChoice: "정차 위치를 찾기 어려웠어요",
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
        question: "오늘 이 배송에서 불편한 점이 있었나요?",
        choices: ["다른 기사에게 알려줄 점이 있어요", "불편하지 않았어요"],
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
        placeId,
        driverId: "driver-a",
        vehicleType: "1TON",
        contribution: { answerChoice: "불편하지 않았어요" },
      }),
    ).rejects.toThrow(/저장할 배송지 운영 지식/);
    expect(await store.getPointBalance("driver-a")).toBe(0);
    expect(store.snapshot().reports).toHaveLength(0);
  });

  it("후보는 독립 확인 카드로만 보여주고 확인 후 정식 가이드로 승격한다", async () => {
    const { pipeline } = createPipeline();
    await pipeline.submitContribution({
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { text: "1톤 차량은 후문으로 진입하세요." },
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
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { text: "1톤 차량은 후문으로 진입하세요." },
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
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { text: "1톤 차량은 후문으로 진입하세요." },
    });

    const result = await pipeline.recordFeedback({
      claimId: report.claimIds[0],
      driverId: "driver-b",
      feedback: "HELPFUL",
    });

    expect(result.status).toBe("CANDIDATE");
    expect(await store.getPointBalance("driver-a")).toBe(15);
  });

  it("서로 다른 두 기사가 사실이 아니라고 하면 충돌 상태로 바꾼다", async () => {
    const { pipeline } = createPipeline();
    const report = await pipeline.submitContribution({
      placeId,
      driverId: "driver-a",
      vehicleType: "1TON",
      contribution: { text: "1톤 차량은 후문으로 진입하세요." },
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
});
