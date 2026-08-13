import { describe, expect, it } from "vitest";

import { createDependencies } from "./dependencies";

const fakeGeminiGateway = {
  generateQuestion: async () => ({
    shouldAsk: true,
    category: "ACCESS" as const,
    questions: [
      {
        id: "friction_type",
        question: "배송지에 들어갈 때 불편한 점이 있었나요?",
        choices: [
          "출입구를 찾기 어려웠어요",
          "진입 절차가 복잡했어요",
          "내부 이동이 어려웠어요",
          "불편하지 않았어요",
        ],
      },
    ],
  }),
  generateKnowledge: async () => ({
    sanitizedSummary: "후문을 이용합니다.",
    removedPiiTypes: [],
    claims: [],
  }),
  matchClaim: async () => ({ relation: "NEW" as const, targetClaimId: null }),
};

describe("서버 의존성 구성", () => {
  it("demo 모드는 Gemini·DB 키 없이 전체 파이프라인을 만든다", async () => {
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

  it("기본 production 모드는 Gemini와 PostgreSQL 설정을 요구한다", () => {
    expect(() => createDependencies({})).toThrow(/GEMINI_API_KEY/);
  });

  it("production 모드는 Railway PostgreSQL DATABASE_URL을 요구한다", () => {
    expect(() =>
      createDependencies(
        {
          MILEZERO_MODE: "production",
          GEMINI_API_KEY: "test-key",
          GEMINI_MODEL: "gemini-test",
        },
        { createGeminiGateway: () => fakeGeminiGateway },
      ),
    ).toThrow(/DATABASE_URL/);
  });

  it("judge 모드는 실제 Gemini 계약과 복원 가능한 초기 지식을 함께 사용한다", async () => {
    const dependencies = createDependencies(
      {
        MILEZERO_MODE: "judge",
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "gemini-test",
      },
      { createGeminiGateway: () => fakeGeminiGateway },
    );

    expect(dependencies.mode).toBe("judge");
    expect(dependencies.inspect?.().claims[0]?.id).toBe("demo-guide-claim");
    await dependencies.pipeline.recordFeedback({
      claimId: "demo-guide-claim",
      driverId: "judge-driver",
      feedback: "CONTRADICT",
    });
    expect(dependencies.inspect?.().evidence).toHaveLength(4);

    await dependencies.resetSimulation?.();

    expect(dependencies.inspect?.().evidence).toHaveLength(3);
  });

  it("알 수 없는 실행 모드를 거부한다", () => {
    expect(() => createDependencies({ MILEZERO_MODE: "staging" })).toThrow(
      /MILEZERO_MODE/,
    );
  });
});
