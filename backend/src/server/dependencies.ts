import { createDemoGateway } from "@/demo/gateway";
import { createGeminiGatewayFromEnv } from "@/gemini/gateway";
import { BackendPipeline } from "@/pipeline/pipeline";
import { InMemoryKnowledgeStore } from "@/storage/in-memory-store";
import { createSupabaseKnowledgeStoreFromEnv } from "@/storage/supabase-store";

export function createDependencies(env: NodeJS.ProcessEnv) {
  if (env.MILEZERO_MODE === "demo") {
    const createdAt = "2026-08-13T00:00:00.000Z";
    const store = new InMemoryKnowledgeStore({
      reports: [
        {
          id: "demo-guide-report",
          placeId: "demo-office-tower",
          driverId: "demo-knowledge-reporter",
          sanitizedSummary: "1톤 차량은 후문 진입 후 B2 하역장을 이용합니다.",
          removedPiiTypes: [],
          createdAt,
        },
      ],
      claims: [
        {
          id: "demo-guide-claim",
          reportId: "demo-guide-report",
          placeId: "demo-office-tower",
          reporterId: "demo-knowledge-reporter",
          type: "INTERNAL_ROUTE",
          value: "1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요",
          vehicleType: "1TON",
          timeCondition: null,
          status: "VERIFIED",
          confidence: 0.65,
          helpfulCount: 2,
          notHelpfulCount: 0,
          utilityScore: 0.7,
          createdAt,
        },
      ],
      evidence: [
        {
          claimId: "demo-guide-claim",
          driverId: "demo-seed-verifier",
          feedback: "CONFIRM",
          source: "DRIVER_FEEDBACK",
          createdAt,
        },
        {
          claimId: "demo-guide-claim",
          driverId: "demo-seed-helper-a",
          feedback: "HELPFUL",
          source: "DRIVER_FEEDBACK",
          createdAt,
        },
        {
          claimId: "demo-guide-claim",
          driverId: "demo-seed-helper-b",
          feedback: "HELPFUL",
          source: "DRIVER_FEEDBACK",
          createdAt,
        },
      ],
    });
    const gateway = createDemoGateway();
    return {
      mode: "demo" as const,
      pipeline: new BackendPipeline({ store, ...gateway }),
      readiness: () => store.getPointBalance("readiness-probe"),
      inspect: () => store.snapshot(),
    };
  }

  const gateway = createGeminiGatewayFromEnv(env);
  const store = createSupabaseKnowledgeStoreFromEnv(env);
  return {
    mode: "production" as const,
    pipeline: new BackendPipeline({
      store,
      generateQuestion: gateway.generateQuestion,
      generateKnowledge: gateway.generateKnowledge.bind(gateway),
      matchClaim: gateway.matchClaim,
    }),
    readiness: () => store.getPointBalance("readiness-probe"),
    inspect: undefined,
  };
}
