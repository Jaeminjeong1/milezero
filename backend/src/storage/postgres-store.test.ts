import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  PostgresKnowledgeStore,
  attachPostgresPoolErrorHandler,
  createPostgresKnowledgeStoreFromEnv,
} from "./postgres-store";

const claimRow = {
  id: "claim-1",
  report_id: "report-1",
  place_id: "place-1",
  reporter_id: "driver-a",
  claim_type: "ENTRANCE_RECOMMENDATION",
  value: "후문 진입",
  vehicle_type: "1TON",
  time_condition: null,
  status: "CANDIDATE",
  confidence: "0.350",
  helpful_count: 0,
  not_helpful_count: 0,
  utility_score: "0.500",
  created_at: "2026-08-13T00:00:00.000Z",
};

describe("PostgreSQL 지식 저장소", () => {
  it("idle connection 오류를 처리해 EventEmitter 오류로 프로세스가 종료되지 않게 한다", () => {
    const failure = new Error("connection terminated");
    const report = vi.fn();
    const pool = Object.assign(new EventEmitter(), {
      query: async () => ({ rows: [] }),
    });

    attachPostgresPoolErrorHandler(pool, report);
    pool.emit("error", failure);

    expect(report).toHaveBeenCalledWith(failure);
  });

  it("비식별 report와 claim DB 행을 도메인 객체로 변환한다", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("mz_create_report")) {
        return {
          rows: [
            {
              data: {
                id: "report-1",
                place_id: "place-1",
                driver_id: "driver-a",
                sanitized_summary: "후문으로 진입합니다.",
                removed_pii_types: ["PHONE"],
                created_at: "2026-08-13T00:00:00.000Z",
              },
            },
          ],
        };
      }
      return { rows: [{ data: claimRow }] };
    });
    const store = new PostgresKnowledgeStore({ query });

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

  it("허용된 DB 함수를 JSON parameter로 호출하고 claim을 변환한다", async () => {
    const query = vi.fn(async () => ({ rows: [{ data: claimRow }] }));
    const store = new PostgresKnowledgeStore({ query });

    const claim = await store.getClaim("claim-1");

    expect(claim).toEqual({
      id: "claim-1",
      reportId: "report-1",
      placeId: "place-1",
      reporterId: "driver-a",
      type: "ENTRANCE_RECOMMENDATION",
      value: "후문 진입",
      vehicleType: "1TON",
      timeCondition: null,
      status: "CANDIDATE",
      confidence: 0.35,
      helpfulCount: 0,
      notHelpfulCount: 0,
      utilityScore: 0.5,
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    expect(query).toHaveBeenCalledWith(
      "select public.mz_get_claim($1::jsonb) as data",
      [JSON.stringify({ claim_id: "claim-1" })],
    );
  });

  it("DB 오류를 조용히 삼키지 않는다", async () => {
    const store = new PostgresKnowledgeStore({
      query: async () => {
        throw new Error("database unavailable");
      },
    });

    await expect(store.getClaim("claim-1")).rejects.toThrow(
      "database unavailable",
    );
  });

  it("production 연결에는 DATABASE_URL이 필요하다", () => {
    expect(() => createPostgresKnowledgeStoreFromEnv({})).toThrow(
      "DATABASE_URL이 필요합니다.",
    );
  });
});
