import { describe, expect, it } from "vitest";

import { SupabaseKnowledgeStore } from "./supabase-store";

describe("Supabase 지식 저장소", () => {
  it("비식별 report와 claim DB 행을 도메인 객체로 변환한다", async () => {
    const store = new SupabaseKnowledgeStore({
      rpc: async (name) => {
        if (name === "mz_create_report") {
          return {
            data: {
              id: "report-1",
              place_id: "place-1",
              driver_id: "driver-a",
              sanitized_summary: "후문으로 진입합니다.",
              removed_pii_types: ["PHONE"],
              created_at: "2026-08-13T00:00:00.000Z",
            },
            error: null,
          };
        }
        if (name === "mz_create_claim") {
          return {
            data: {
              id: "claim-1",
              report_id: "report-1",
              place_id: "place-1",
              reporter_id: "driver-a",
              claim_type: "ENTRANCE_RECOMMENDATION",
              value: "후문 진입",
              vehicle_type: "1TON",
              time_condition: null,
              status: "CANDIDATE",
              confidence: 0.35,
              helpful_count: 0,
              not_helpful_count: 0,
              utility_score: 0.5,
              created_at: "2026-08-13T00:00:00.000Z",
            },
            error: null,
          };
        }
        throw new Error(`예상하지 못한 RPC: ${name}`);
      },
    });

    const report = await store.createReport({
      placeId: "place-1",
      driverId: "driver-a",
      sanitizedSummary: "후문으로 진입합니다.",
      removedPiiTypes: ["PHONE"],
    });
    const claim = await store.createClaim({
      reportId: report.id,
      placeId: report.placeId,
      reporterId: report.driverId,
      type: "ENTRANCE_RECOMMENDATION",
      value: "후문 진입",
      vehicleType: "1TON",
      timeCondition: null,
    });

    expect(report.removedPiiTypes).toEqual(["PHONE"]);
    expect(claim.status).toBe("CANDIDATE");
  });

  it("DB 오류를 조용히 삼키지 않는다", async () => {
    const store = new SupabaseKnowledgeStore({
      rpc: async () => ({
        data: null,
        error: { message: "database unavailable" },
      }),
    });

    await expect(
      store.getClaim("claim-1"),
    ).rejects.toThrow("database unavailable");
  });
});
