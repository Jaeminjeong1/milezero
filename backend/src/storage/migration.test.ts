import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../migrations/001_initial.sql", import.meta.url),
);

describe("Railway PostgreSQL 영속 저장 스키마", () => {
  it("비식별 report·claim을 저장하고 사실·유용성 중복을 각각 막는다", async () => {
    const database = new PGlite();
    await database.exec(await readFile(migrationPath, "utf8"));

    const reportResult = await database.query<{ data: Record<string, unknown> }>(
      "select mz_create_report($1::jsonb) as data",
      [
        JSON.stringify({
          place_id: "place-1",
          driver_id: "driver-a",
          sanitized_summary: "후문으로 진입합니다.",
          removed_pii_types: ["PHONE"],
        }),
      ],
    );
    const reportId = String(reportResult.rows[0].data.id);
    const claimResult = await database.query<{ data: Record<string, unknown> }>(
      "select mz_create_claim($1::jsonb) as data",
      [
        JSON.stringify({
          report_id: reportId,
          place_id: "place-1",
          reporter_id: "driver-a",
          claim_type: "ENTRANCE_RECOMMENDATION",
          value: "후문 진입",
          vehicle_type: "1TON",
          time_condition: null,
        }),
      ],
    );
    const claimId = String(claimResult.rows[0].data.id);
    const evidencePayload = JSON.stringify({
      claim_id: claimId,
      driver_id: "driver-b",
      feedback: "CONFIRM",
      source: "DRIVER_FEEDBACK",
    });
    const first = await database.query<{ accepted: boolean }>(
      "select mz_add_evidence($1::jsonb) as accepted",
      [evidencePayload],
    );
    const duplicate = await database.query<{ accepted: boolean }>(
      "select mz_add_evidence($1::jsonb) as accepted",
      [
        JSON.stringify({
          claim_id: claimId,
          driver_id: "driver-b",
          feedback: "CONTRADICT",
          source: "DRIVER_FEEDBACK",
        }),
      ],
    );
    const utility = await database.query<{ accepted: boolean }>(
      "select mz_add_evidence($1::jsonb) as accepted",
      [
        JSON.stringify({
          claim_id: claimId,
          driver_id: "driver-b",
          feedback: "NOT_HELPFUL",
          source: "DRIVER_FEEDBACK",
        }),
      ],
    );
    const duplicateUtility = await database.query<{ accepted: boolean }>(
      "select mz_add_evidence($1::jsonb) as accepted",
      [
        JSON.stringify({
          claim_id: claimId,
          driver_id: "driver-b",
          feedback: "HELPFUL",
          source: "DRIVER_FEEDBACK",
        }),
      ],
    );

    expect(first.rows[0].accepted).toBe(true);
    expect(duplicate.rows[0].accepted).toBe(false);
    expect(utility.rows[0].accepted).toBe(true);
    expect(duplicateUtility.rows[0].accepted).toBe(false);

    const columns = await database.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name in ('reports', 'claims')",
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining(["raw_text", "raw_media", "gps_trace"]),
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["not_helpful_count", "utility_score"]),
    );

    await database.close();
  }, 30_000);

  it("별도 플랫폼 role이나 RLS 없이 애플리케이션 DB owner가 접근한다", async () => {
    const database = new PGlite();
    await database.exec(await readFile(migrationPath, "utf8"));

    const result = await database.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'",
    );

    expect(result.rows).toEqual(
      expect.arrayContaining(
        ["reports", "claims", "claim_evidence", "points_ledger"].map(
          (relname) => expect.objectContaining({ relname, relrowsecurity: false }),
        ),
      ),
    );
    const functions = await database.query<{
      proname: string;
      prosecdef: boolean;
    }>(
      "select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname like 'mz_%'",
    );
    expect(functions.rows).not.toHaveLength(0);
    expect(functions.rows.every((row) => row.prosecdef === false)).toBe(true);
    await database.close();
  }, 30_000);

  it("제보·후보 주장·기본 포인트를 한 트랜잭션으로 저장하고 재전송 결과를 재사용한다", async () => {
    const database = new PGlite();
    await database.exec(await readFile(migrationPath, "utf8"));
    const payload = JSON.stringify({
      idempotency_key: "submission-atomic",
      place_id: "place-1",
      driver_id: "driver-a",
      sanitized_summary: "후문으로 진입합니다.",
      removed_pii_types: ["PHONE"],
      operations: [
        {
          kind: "NEW",
          claim: {
            claim_type: "ENTRANCE_RECOMMENDATION",
            value: "후문 진입",
            vehicle_type: "1TON",
            time_condition: null,
          },
        },
      ],
    });

    const first = await database.query<{ receipt: Record<string, unknown> }>(
      "select mz_commit_contribution($1::jsonb) as receipt",
      [payload],
    );
    const second = await database.query<{ receipt: Record<string, unknown> }>(
      "select mz_commit_contribution($1::jsonb) as receipt",
      [payload],
    );
    const counts = await database.query<{
      reports: number;
      claims: number;
      points: number;
    }>(
      "select (select count(*)::int from reports) reports, (select count(*)::int from claims) claims, (select count(*)::int from points_ledger) points",
    );

    expect(second.rows[0].receipt).toEqual(first.rows[0].receipt);
    expect(counts.rows[0]).toEqual({ reports: 1, claims: 1, points: 1 });
    await database.close();
  }, 30_000);
});
