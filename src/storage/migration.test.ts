import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../supabase/migrations/202608130001_milezero_pipeline.sql",
    import.meta.url,
  ),
);

describe("Supabase 영속 저장 스키마", () => {
  it("비식별 report·claim을 저장하고 증거 중복을 막는다", async () => {
    const database = new PGlite();
    await database.exec(
      "create role anon; create role authenticated; create role service_role;",
    );
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
      [evidencePayload],
    );

    expect(first.rows[0].accepted).toBe(true);
    expect(duplicate.rows[0].accepted).toBe(false);

    const columns = await database.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name in ('reports', 'claims')",
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining(["raw_text", "raw_media", "gps_trace"]),
    );

    await database.close();
  }, 30_000);

  it("모든 지식 테이블에 RLS가 활성화된다", async () => {
    const database = new PGlite();
    await database.exec(
      "create role anon; create role authenticated; create role service_role;",
    );
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
          (relname) => expect.objectContaining({ relname, relrowsecurity: true }),
        ),
      ),
    );
    await database.close();
  }, 30_000);
});
