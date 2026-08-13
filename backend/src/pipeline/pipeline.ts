import type { Claim } from "@/domain/contracts";
import {
  ClaimNotFoundError,
  IndependentVerificationError,
  InvalidContributionError,
} from "@/domain/errors";
import { detectFriction, summarizeGps } from "@/friction/detector";
import type { GpsSample } from "@/friction/types";
import type { FrictionFeatures } from "@/friction/types";
import {
  analyzeContribution,
  type ContributionInput,
  type KnowledgeGenerator,
} from "@/knowledge/analyzer";
import {
  planQuestion,
  type QuestionGenerator,
} from "@/questions/planner";
import type {
  ContributionOperation,
  KnowledgeStore,
  StoredClaim,
} from "@/storage/contracts";
import {
  evaluateClaim,
  type FeedbackType,
} from "@/validation/evaluator";

export type ClaimMatchResult =
  | { relation: "NEW"; targetClaimId: null }
  | {
      relation: "SUPPORTS" | "CONTRADICTS";
      targetClaimId: string;
    };

export type ClaimMatcher = (
  candidate: Claim,
  existing: StoredClaim[],
) => Promise<ClaimMatchResult>;

type PipelineDependencies = {
  store: KnowledgeStore;
  generateQuestion: QuestionGenerator;
  generateKnowledge: KnowledgeGenerator;
  matchClaim: ClaimMatcher;
};

export class BackendPipeline {
  constructor(private readonly dependencies: PipelineDependencies) {}

  async createQuestionFromGps(samples: GpsSample[]) {
    const decision = detectFriction(summarizeGps(samples));
    return planQuestion(decision, this.dependencies.generateQuestion);
  }

  async createQuestionFromFeatures(features: FrictionFeatures) {
    const decision = detectFriction(features);
    return planQuestion(decision, this.dependencies.generateQuestion);
  }

  async submitContribution(input: {
    idempotencyKey: string;
    placeId: string;
    driverId: string;
    vehicleType: Claim["vehicleType"];
    contribution: ContributionInput;
  }) {
    const previous = await this.dependencies.store.getContributionReceipt(
      input.idempotencyKey,
      input.driverId,
    );
    if (previous) return previous;

    const analysis = await analyzeContribution(
      input.contribution,
      this.dependencies.generateKnowledge,
    );
    if (analysis.claims.length === 0) {
      throw new InvalidContributionError("저장할 배송지 운영 지식이 없습니다.");
    }
    const operations: ContributionOperation[] = [];
    const evidenceClaimIds: string[] = [];
    for (const candidate of analysis.claims) {
      const existing = await this.dependencies.store.findClaims({
        placeId: input.placeId,
        type: candidate.type,
        vehicleType: candidate.vehicleType,
      });
      const match = await this.dependencies.matchClaim(candidate, existing);
      const target =
        match.targetClaimId === null
          ? null
          : existing.find((claim) => claim.id === match.targetClaimId) ?? null;

      if (target?.status === "CONFLICT") {
        operations.push({
          kind: "NEW",
          claim: {
            ...candidate,
            vehicleType:
              candidate.vehicleType === "ALL"
                ? input.vehicleType
                : candidate.vehicleType,
          },
        });
        continue;
      }

      if (target && match.relation !== "NEW") {
        if (target.reporterId !== input.driverId) {
          operations.push({
            kind: "EVIDENCE",
            claimId: target.id,
            feedback: match.relation === "SUPPORTS" ? "CONFIRM" : "CONTRADICT",
          });
          evidenceClaimIds.push(target.id);
        } else {
          operations.push({ kind: "EVIDENCE", claimId: target.id, feedback: "CONFIRM" });
        }
        continue;
      }

      operations.push({
        kind: "NEW",
        claim: {
          ...candidate,
          vehicleType:
            candidate.vehicleType === "ALL"
              ? input.vehicleType
              : candidate.vehicleType,
        },
      });
    }

    const receipt = await this.dependencies.store.commitContribution({
      idempotencyKey: input.idempotencyKey,
      placeId: input.placeId,
      driverId: input.driverId,
      sanitizedSummary: analysis.sanitizedSummary,
      removedPiiTypes: analysis.removedPiiTypes,
      operations,
    });
    const refreshed = new Map<string, StoredClaim>();
    for (const claimId of new Set(evidenceClaimIds)) {
      refreshed.set(claimId, await this.refreshClaim(claimId));
    }
    return {
      ...receipt,
      claimStatuses: receipt.claimIds.map(
        (claimId, index) =>
          refreshed.get(claimId)?.status ?? receipt.claimStatuses[index],
      ),
    };
  }

  async getDeliveryKnowledge(input: {
    placeId: string;
    driverId: string;
    vehicleType: Claim["vehicleType"];
  }) {
    const verified = await this.dependencies.store.findClaims({
      placeId: input.placeId,
      vehicleType: input.vehicleType,
      statuses: ["VERIFIED"],
    });
    const candidates = await this.dependencies.store.findClaims({
      placeId: input.placeId,
      vehicleType: input.vehicleType,
      statuses: ["CANDIDATE"],
    });
    const candidate = candidates.find(
      (claim) => claim.reporterId !== input.driverId,
    );

    return {
      items: verified
        .filter((claim) => claim.reporterId !== input.driverId)
        .slice(0, 5)
        .map((claim) => ({
          claimId: claim.id,
          text: claim.value,
          type: claim.type,
          vehicleType: claim.vehicleType,
          timeCondition: claim.timeCondition,
          confidence: claim.confidence,
          reportedAt: claim.createdAt,
        })),
      pendingConfirmation: candidate
        ? { claimId: candidate.id, text: candidate.value }
        : null,
    };
  }

  async recordFeedback(input: {
    claimId: string;
    driverId: string;
    feedback: FeedbackType;
  }) {
    const claim = await this.dependencies.store.getClaim(input.claimId);
    if (!claim) throw new ClaimNotFoundError("지식 후보를 찾을 수 없습니다.");
    if (claim.reporterId === input.driverId) {
      throw new IndependentVerificationError(
        "제보와 검증은 독립 기사에 의해 수행되어야 합니다.",
      );
    }

    const accepted = await this.dependencies.store.addEvidence({
      ...input,
      source: "DRIVER_FEEDBACK",
    });
    const updated = await this.refreshClaim(claim.id);

    if (input.feedback === "HELPFUL") {
      await this.dependencies.store.awardPoints({
        key: `claim:${claim.id}:helpful:${input.driverId}`,
        driverId: claim.reporterId,
        points: 5,
        reason: "GUIDE_HELPFUL",
      });
    }

    return {
      accepted,
      status: updated.status,
      confidence: updated.confidence,
      helpfulCount: updated.helpfulCount,
      notHelpfulCount: updated.notHelpfulCount,
      utilityScore: updated.utilityScore,
    };
  }

  private async refreshClaim(claimId: string) {
    const claim = await this.dependencies.store.getClaim(claimId);
    if (!claim) throw new ClaimNotFoundError("지식 후보를 찾을 수 없습니다.");
    const evaluated = evaluateClaim(
      claim.reporterId,
      await this.dependencies.store.listEvidence(claim.id),
    );
    const updated = await this.dependencies.store.updateClaim(
      claim.id,
      evaluated,
    );

    if (updated.status === "VERIFIED") {
      await this.dependencies.store.awardPoints({
        key: `claim:${claim.id}:verified`,
        driverId: claim.reporterId,
        points: 20,
        reason: "CLAIM_VERIFIED",
      });
    }
    return updated;
  }
}
