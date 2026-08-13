import { describe, expect, it } from "vitest";

import { createDemoKnowledgeSeed } from "@/demo/seed";

import { InMemoryKnowledgeStore } from "./in-memory-store";

describe("인메모리 지식 저장소 초기화", () => {
  it("변경된 데이터와 멱등 기록을 모두 버리고 초기 seed로 복원한다", async () => {
    const seed = createDemoKnowledgeSeed();
    const store = new InMemoryKnowledgeStore(seed);
    await store.commitContribution({
      idempotencyKey: "reset-report-key",
      placeId: "demo-office-tower",
      driverId: "demo-driver-a",
      sanitizedSummary: "후문을 이용합니다.",
      removedPiiTypes: [],
      operations: [
        {
          kind: "NEW",
          claim: {
            type: "ENTRANCE_RECOMMENDATION",
            value: "후문을 이용합니다.",
            vehicleType: "1TON",
            timeCondition: null,
          },
        },
      ],
    });
    expect(store.snapshot().reports).toHaveLength(2);

    store.reset(seed);

    expect(store.snapshot()).toEqual(
      new InMemoryKnowledgeStore(createDemoKnowledgeSeed()).snapshot(),
    );
    expect(
      await store.getContributionReceipt("reset-report-key", "demo-driver-a"),
    ).toBeNull();
  });
});
