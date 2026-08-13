import { createClient } from "@supabase/supabase-js";
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
  KnowledgeStore,
  PointEntry,
  StoredClaim,
  StoredEvidence,
  StoredReport,
} from "./contracts";

type RpcError = { message: string };
type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
};

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
  created_at: z.string(),
});

const EvidenceRowSchema = z.object({
  claim_id: z.string(),
  driver_id: z.string(),
  feedback: z.enum(["CONFIRM", "CONTRADICT", "HELPFUL"]),
  source: z.enum(["REPORT", "DRIVER_FEEDBACK"]),
  created_at: z.string(),
});

export class SupabaseKnowledgeStore implements KnowledgeStore {
  constructor(private readonly client: RpcClient) {}

  async createReport(
    report: Omit<StoredReport, "id" | "createdAt">,
  ): Promise<StoredReport> {
    const row = ReportRowSchema.parse(
      await this.call("mz_create_report", {
        payload: {
          place_id: report.placeId,
          driver_id: report.driverId,
          sanitized_summary: report.sanitizedSummary,
          removed_pii_types: report.removedPiiTypes,
        },
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
      "id" | "status" | "confidence" | "helpfulCount" | "createdAt"
    >,
  ): Promise<StoredClaim> {
    return mapClaimRow(
      ClaimRowSchema.parse(
        await this.call("mz_create_claim", {
          payload: {
            report_id: claim.reportId,
            place_id: claim.placeId,
            reporter_id: claim.reporterId,
            claim_type: claim.type,
            value: claim.value,
            vehicle_type: claim.vehicleType,
            time_condition: claim.timeCondition,
          },
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
        payload: {
          place_id: input.placeId,
          claim_type: input.type ?? null,
          vehicle_type: input.vehicleType ?? null,
          statuses: input.statuses ?? null,
        },
      }),
    );
    return rows.map(mapClaimRow);
  }

  async getClaim(claimId: string): Promise<StoredClaim | null> {
    const data = await this.call("mz_get_claim", {
      payload: { claim_id: claimId },
    });
    return data === null ? null : mapClaimRow(ClaimRowSchema.parse(data));
  }

  async updateClaim(
    claimId: string,
    update: Pick<StoredClaim, "status" | "confidence" | "helpfulCount">,
  ): Promise<StoredClaim> {
    return mapClaimRow(
      ClaimRowSchema.parse(
        await this.call("mz_update_claim", {
          payload: {
            claim_id: claimId,
            status: update.status,
            confidence: update.confidence,
            helpful_count: update.helpfulCount,
          },
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
        payload: {
          claim_id: input.claimId,
          driver_id: input.driverId,
          feedback: input.feedback,
          source: input.source,
        },
      }),
    );
  }

  async listEvidence(claimId: string): Promise<StoredEvidence[]> {
    const rows = z.array(EvidenceRowSchema).parse(
      await this.call("mz_list_evidence", {
        payload: { claim_id: claimId },
      }),
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
        payload: {
          idempotency_key: entry.key,
          driver_id: entry.driverId,
          points: entry.points,
          reason: entry.reason,
        },
      }),
    );
  }

  async getPointBalance(driverId: string): Promise<number> {
    return z.coerce.number().parse(
      await this.call("mz_point_balance", {
        payload: { driver_id: driverId },
      }),
    );
  }

  private async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
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
    createdAt: row.created_at,
  };
}

export function createSupabaseKnowledgeStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseKnowledgeStore {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL이 필요합니다.");
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseKnowledgeStore({
    rpc: async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      return {
        data,
        error: error ? { message: error.message } : null,
      };
    },
  });
}
