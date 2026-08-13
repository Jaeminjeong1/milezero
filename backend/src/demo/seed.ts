import type { InMemoryKnowledgeSeed } from "@/storage/in-memory-store";

const CREATED_AT = "2026-08-13T00:00:00.000Z";

export function createDemoKnowledgeSeed(): InMemoryKnowledgeSeed {
  return {
    reports: [
      {
        id: "demo-guide-report",
        placeId: "demo-office-tower",
        driverId: "demo-knowledge-reporter",
        sanitizedSummary: "1톤 차량은 후문 진입 후 B2 하역장을 이용합니다.",
        removedPiiTypes: [],
        createdAt: CREATED_AT,
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
        createdAt: CREATED_AT,
      },
    ],
    evidence: [
      {
        claimId: "demo-guide-claim",
        driverId: "demo-seed-verifier",
        feedback: "CONFIRM",
        source: "DRIVER_FEEDBACK",
        createdAt: CREATED_AT,
      },
      {
        claimId: "demo-guide-claim",
        driverId: "demo-seed-helper-a",
        feedback: "HELPFUL",
        source: "DRIVER_FEEDBACK",
        createdAt: CREATED_AT,
      },
      {
        claimId: "demo-guide-claim",
        driverId: "demo-seed-helper-b",
        feedback: "HELPFUL",
        source: "DRIVER_FEEDBACK",
        createdAt: CREATED_AT,
      },
    ],
  };
}
