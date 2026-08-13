import { describe, expect, it } from "vitest";

import { createDependencies } from "./dependencies";

describe("서버 의존성 구성", () => {
  it("demo 모드는 Gemini·Supabase 키 없이 전체 파이프라인을 만든다", async () => {
    const dependencies = createDependencies({ MILEZERO_MODE: "demo" });

    const question = await dependencies.pipeline.createQuestionFromFeatures({
      dwellSeconds: 420,
      stopCount: 3,
      travelMeters: 90,
      displacementMeters: 20,
      acceptedSampleCount: 8,
    });
    const receipt = await dependencies.pipeline.submitContribution({
      idempotencyKey: "runtime-demo-report",
      placeId: "demo-office-tower",
      driverId: "demo-driver-a",
      vehicleType: "1TON",
      contribution: {
        answers: [
          {
            questionId: "friction_type",
            question: "오늘 이 배송에서 불편한 점이 있었나요?",
            choice: "출입구를 찾기 어려웠어요",
          },
        ],
        text: "010-1234-5678로 연락했고 후문으로 들어갔어요.",
      },
    });

    expect(dependencies.mode).toBe("demo");
    expect(question?.questions[0]?.question).toContain("불편한 점");
    expect(receipt.awardedPoints).toBe(10);
    expect(JSON.stringify(dependencies.inspect?.())).not.toContain("010-1234-5678");
    await expect(dependencies.readiness()).resolves.toBeDefined();
  });

  it("demo 모드는 도움 받는 기사에게 검증된 사전 가이드를 제공한다", async () => {
    const dependencies = createDependencies({ MILEZERO_MODE: "demo" });

    const knowledge = await dependencies.pipeline.getDeliveryKnowledge({
      placeId: "demo-office-tower",
      driverId: "demo-driver-b",
      vehicleType: "1TON",
    });

    expect(knowledge.items[0]).toEqual(
      expect.objectContaining({
        claimId: "demo-guide-claim",
        text: expect.stringContaining("B2"),
        type: "INTERNAL_ROUTE",
        vehicleType: "1TON",
        timeCondition: null,
        reportedAt: expect.any(String),
      }),
    );
  });

  it("기본 production 모드는 Gemini와 Supabase 설정을 요구한다", () => {
    expect(() => createDependencies({})).toThrow(/GEMINI_API_KEY/);
  });
});
