import { Pool } from "pg";
import { z } from "zod";

import {
  ClaimSchema,
  PiiTypeSchema,
  type Claim,
} from "@/domain/contracts";
import {
  type ClaimStatus,
  type FeedbackType,
} from "@/validation/evaluator";

import type {
  CommitContributionInput,
  ContributionReceipt,
  KnowledgeStore,
  PointEntry,
  StoredClaim,
  StoredEvidence,
  StoredReport,
} from "./contracts";

type QueryClient = {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Array<{ data: unknown }> }>;
};

type PoolErrorEmitter = {
  on(event: "error", listener: (error: Error) => void): unknown;
};

const RpcSql = {
  mz_get_contribution_receipt:
    "select public.mz_get_contribution_receipt($1::jsonb) as data",
  mz_commit_contribution:
    "select public.mz_commit_contribution($1::jsonb) as data",
  mz_create_report: "select public.mz_create_report($1::jsonb) as data",
  mz_create_claim: "select public.mz_create_claim($1::jsonb) as data",
  mz_find_claims: "select public.mz_find_claims($1::jsonb) as data",
  mz_get_claim: "select public.mz_get_claim($1::jsonb) as data",
  mz_update_claim: "select public.mz_update_claim($1::jsonb) as data",
  mz_add_evidence: "select public.mz_add_evidence($1::jsonb) as data",
  mz_list_evidence: "select public.mz_list_evidence($1::jsonb) as data",
  mz_award_points: "select public.mz_award_points($1::jsonb) as data",
  mz_point_balance: "select public.mz_point_balance($1::jsonb) as data",
} as const;

type RpcName = keyof typeof RpcSql;

const ReportRowSchema = z.object({
  id: z.string(),
  place_id: z.string(),
  driver_id: z.string(),
  sanitized_summary: z.string(),
  removed_pii_types: z.array(PiiTypeSchema),
  created_at: z.string(),
});

const ClaimRowSchema = z.object({
  id: z.string(),
  report_id: z.string(),
  place_id: z.string(),
  reporter_id: z.string(),
  claim_type: ClaimSchema.shape.type,
  value: z.string(),
  vehicle_type: ClaimSchema.shape.vehicleType,
  time_condition: z.string().nullable(),
  status: z.enum(["CANDIDATE", "VERIFIED", "CONFLICT"]),
  confidence: z.coerce.number(),
  helpful_count: z.coerce.number().int(),
  not_helpful_count: z.coerce.number().int(),
  utility_score: z.coerce.number(),
  created_at: z.string(),
});

const EvidenceRowSchema = z.object({
  claim_id: z.string(),
  driver_id: z.string(),
  feedback: z.enum(["CONFIRM", "CONTRADICT", "HELPFUL", "NOT_HELPFUL"]),
  source: z.enum(["REPORT", "DRIVER_FEEDBACK"]),
  created_at: z.string(),
});

const ContributionReceiptSchema = z.object({
  reportId: z.string(),
  claimIds: z.array(z.string()),
  claimStatuses: z.array(z.enum(["CANDIDATE", "VERIFIED", "CONFLICT"])),
  awardedPoints: z.literal(10),
});

export class PostgresKnowledgeStore implements KnowledgeStore {
  constructor(private readonly client: QueryClient) {}

  async resetToEmptyData(): Promise<void> {
    const result = await this.client.query(
      "select public.mz_reset_to_empty_data() as data",
    );
    z.literal(true).parse(result.rows[0]?.data);
  }

  async getContributionReceipt(
    idempotencyKey: string,
    driverId: string,
  ): Promise<ContributionReceipt | null> {
    const data = await this.call("mz_get_contribution_receipt", {
      idempotency_key: idempotencyKey,
      driver_id: driverId,
    });
    return data === null ? null : ContributionReceiptSchema.parse(data);
  }

  async commitContribution(
    input: CommitContributionInput,
  ): Promise<ContributionReceipt> {
    return ContributionReceiptSchema.parse(
      await this.call("mz_commit_contribution", {
        idempotency_key: input.idempotencyKey,
        place_id: input.placeId,
        driver_id: input.driverId,
        sanitized_summary: input.sanitizedSummary,
        removed_pii_types: input.removedPiiTypes,
        operations: input.operations.map((operation) =>
          operation.kind === "NEW"
            ? {
                kind: operation.kind,
                claim: {
                  claim_type: operation.claim.type,
                  value: operation.claim.value,
                  vehicle_type: operation.claim.vehicleType,
                  time_condition: operation.claim.timeCondition,
                },
              }
            : {
                kind: operation.kind,
                claim_id: operation.claimId,
                feedback: operation.feedback,
              },
        ),
      }),
    );
  }

  async createReport(
    report: Omit<StoredReport, "id" | "createdAt">,
  ): Promise<StoredReport> {
    const row = ReportRowSchema.parse(
      await this.call("mz_create_report", {
        place_id: report.placeId,
        driver_id: report.driverId,
        sanitized_summary: report.sanitizedSummary,
        removed_pii_types: report.removedPiiTypes,
      }),
    );
    return {
      id: row.id,
      placeId: row.place_id,
      driverId: row.driver_id,
      sanitizedSummary: row.sanitized_summary,
      removedPiiTypes: row.removed_pii_types,
      createdAt: row.created_at,
    };
  }

  async createClaim(
    claim: Omit<
      StoredClaim,
      | "id"
      | "status"
      | "confidence"
      | "helpfulCount"
      | "notHelpfulCount"
      | "utilityScore"
      | "createdAt"
    >,
  ): Promise<StoredClaim> {
    return mapClaimRow(
      ClaimRowSchema.parse(
        await this.call("mz_create_claim", {
          report_id: claim.reportId,
          place_id: claim.placeId,
          reporter_id: claim.reporterId,
          claim_type: claim.type,
          value: claim.value,
          vehicle_type: claim.vehicleType,
          time_condition: claim.timeCondition,
        }),
      ),
    );
  }

  async findClaims(input: {
    placeId: string;
    type?: Claim["type"];
    vehicleType?: Claim["vehicleType"];
    statuses?: ClaimStatus[];
  }): Promise<StoredClaim[]> {
    const rows = z.array(ClaimRowSchema).parse(
      await this.call("mz_find_claims", {
        place_id: input.placeId,
        claim_type: input.type ?? null,
        vehicle_type: input.vehicleType ?? null,
        statuses: input.statuses ?? null,
      }),
    );
    return rows.map(mapClaimRow);
  }

  async getClaim(claimId: string): Promise<StoredClaim | null> {
    const data = await this.call("mz_get_claim", { claim_id: claimId });
    return data === null ? null : mapClaimRow(ClaimRowSchema.parse(data));
  }

  async updateClaim(
    claimId: string,
    update: Pick<
      StoredClaim,
      | "status"
      | "confidence"
      | "helpfulCount"
      | "notHelpfulCount"
      | "utilityScore"
    >,
  ): Promise<StoredClaim> {
    return mapClaimRow(
      ClaimRowSchema.parse(
        await this.call("mz_update_claim", {
          claim_id: claimId,
          status: update.status,
          confidence: update.confidence,
          helpful_count: update.helpfulCount,
          not_helpful_count: update.notHelpfulCount,
          utility_score: update.utilityScore,
        }),
      ),
    );
  }

  async addEvidence(input: {
    claimId: string;
    driverId: string;
    feedback: FeedbackType;
    source: StoredEvidence["source"];
  }): Promise<boolean> {
    return z.boolean().parse(
      await this.call("mz_add_evidence", {
        claim_id: input.claimId,
        driver_id: input.driverId,
        feedback: input.feedback,
        source: input.source,
      }),
    );
  }

  async listEvidence(claimId: string): Promise<StoredEvidence[]> {
    const rows = z.array(EvidenceRowSchema).parse(
      await this.call("mz_list_evidence", { claim_id: claimId }),
    );
    return rows.map((row) => ({
      claimId: row.claim_id,
      driverId: row.driver_id,
      feedback: row.feedback,
      source: row.source,
      createdAt: row.created_at,
    }));
  }

  async awardPoints(entry: PointEntry): Promise<boolean> {
    return z.boolean().parse(
      await this.call("mz_award_points", {
        idempotency_key: entry.key,
        driver_id: entry.driverId,
        points: entry.points,
        reason: entry.reason,
      }),
    );
  }

  async getPointBalance(driverId: string): Promise<number> {
    return z.coerce.number().parse(
      await this.call("mz_point_balance", { driver_id: driverId }),
    );
  }

  private async call(name: RpcName, payload: Record<string, unknown>) {
    const result = await this.client.query(RpcSql[name], [
      JSON.stringify(payload),
    ]);
    return result.rows[0]?.data ?? null;
  }
}

function mapClaimRow(row: z.infer<typeof ClaimRowSchema>): StoredClaim {
  return {
    id: row.id,
    reportId: row.report_id,
    placeId: row.place_id,
    reporterId: row.reporter_id,
    type: row.claim_type,
    value: row.value,
    vehicleType: row.vehicle_type,
    timeCondition: row.time_condition,
    status: row.status,
    confidence: row.confidence,
    helpfulCount: row.helpful_count,
    notHelpfulCount: row.not_helpful_count,
    utilityScore: row.utility_score,
    createdAt: row.created_at,
  };
}

export function createPostgresKnowledgeStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PostgresKnowledgeStore {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL이 필요합니다.");
  const pool = attachPostgresPoolErrorHandler(new Pool({ connectionString }));
  return new PostgresKnowledgeStore(pool);
}

export function attachPostgresPoolErrorHandler<T extends PoolErrorEmitter>(
  pool: T,
  report: (error: Error) => void = (error) => {
    console.error("PostgreSQL idle connection error:", error.message);
  },
): T {
  pool.on("error", report);
  return pool;
}
