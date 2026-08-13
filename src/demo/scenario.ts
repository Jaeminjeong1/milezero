import type { InjectOptions } from "fastify";

import type { AnalysisModelInput } from "@/knowledge/analyzer";
import { BackendPipeline } from "@/pipeline/pipeline";
import { buildServer } from "@/server/server";
import { InMemoryKnowledgeStore } from "@/storage/in-memory-store";

function createDemoPipeline(store: InMemoryKnowledgeStore) {
  return new BackendPipeline({
    store,
    generateQuestion: async ({ context }) => ({
      shouldAsk: true,
      category: context,
      question:
        context === "ACCESS"
          ? "배송지에 들어가거나 이동할 때 불편한 점이 있었나요?"
          : "오늘 이 배송에서 불편한 점이 있었나요?",
      choices: [
        "출입구를 찾기 어려웠어요",
        "정차할 곳을 찾기 어려웠어요",
        "불편하지 않았어요",
      ],
    }),
    generateKnowledge: async (input: AnalysisModelInput) => {
      const hasRearEntranceKnowledge = input.sanitizedText.includes("후문");
      return {
        sanitizedSummary: hasRearEntranceKnowledge
          ? "1톤 차량은 후문으로 진입합니다."
          : "재사용 가능한 배송지 정보가 없습니다.",
        removedPiiTypes: [],
        claims: hasRearEntranceKnowledge
          ? [
              {
                type: "ENTRANCE_RECOMMENDATION",
                value: "1톤 차량은 후문으로 진입",
                vehicleType: "1TON",
                timeCondition: null,
              },
            ]
          : [],
      };
    },
    matchClaim: async (candidate, existing) => {
      const exact = existing.find(
        (claim) =>
          claim.type === candidate.type && claim.value === candidate.value,
      );
      return exact
        ? { relation: "SUPPORTS" as const, targetClaimId: exact.id }
        : { relation: "NEW" as const, targetClaimId: null };
    },
  });
}

type ApiStep = {
  statusCode: number;
  body: any;
};

export async function runDemoScenario() {
  const store = new InMemoryKnowledgeStore();
  const server = buildServer(createDemoPipeline(store), {
    readiness: () => store.getPointBalance("readiness-probe"),
  });

  try {
    const question = await request(server, {
      method: "POST",
      url: "/v1/questions",
      payload: {
        features: {
          dwellSeconds: 420,
          stopCount: 3,
          travelMeters: 90,
          displacementMeters: 20,
          acceptedSampleCount: 8,
        },
      },
    });
    const report = await request(server, {
      method: "POST",
      url: "/v1/reports",
      headers: { "x-driver-id": "demo-driver-a" },
      payload: {
        idempotencyKey: "demo-report-001",
        placeId: "demo-office-tower",
        vehicleType: "1TON",
        contribution: {
          text: "010-1234-5678로 연락했고, 1톤 차량은 후문으로 진입해야 편했습니다.",
        },
      },
    });
    const claimId = String(report.body.claimIds[0]);
    const pending = await request(server, {
      method: "GET",
      url: "/v1/knowledge?placeId=demo-office-tower&vehicleType=1TON",
      headers: { "x-driver-id": "demo-driver-b" },
    });
    const confirm = await request(server, {
      method: "POST",
      url: "/v1/feedback",
      headers: { "x-driver-id": "demo-driver-b" },
      payload: { claimId, feedback: "CONFIRM" },
    });
    const guide = await request(server, {
      method: "GET",
      url: "/v1/knowledge?placeId=demo-office-tower&vehicleType=1TON",
      headers: { "x-driver-id": "demo-driver-c" },
    });
    const helpful = await request(server, {
      method: "POST",
      url: "/v1/feedback",
      headers: { "x-driver-id": "demo-driver-c" },
      payload: { claimId, feedback: "HELPFUL" },
    });

    return {
      question,
      report,
      pending,
      confirm,
      guide,
      helpful,
      reporterPointBalance: await store.getPointBalance("demo-driver-a"),
      persistedData: JSON.stringify(store.snapshot()),
    };
  } finally {
    await server.close();
  }
}

async function request(
  server: ReturnType<typeof buildServer>,
  options: InjectOptions,
): Promise<ApiStep> {
  const response = await server.inject(options);
  return { statusCode: response.statusCode, body: response.json() };
}
