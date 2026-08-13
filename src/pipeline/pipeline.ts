import type { Claim } from "@/domain/contracts";
import { detectFriction, summarizeGps } from "@/friction/detector";
import type { GpsSample } from "@/friction/types";
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

  async submitContribution(input: {
    placeId: string;
    driverId: string;
    vehicleType: Claim["vehicleType"];
    contribution: ContributionInput;
  }) {
    const analysis = await analyzeContribution(
      input.contribution,
      this.dependencies.generateKnowledge,
    );
    const report = await this.dependencies.store.createReport({
      placeId: input.placeId,
      driverId: input.driverId,
      sanitizedSummary: analysis.sanitizedSummary,
      removedPiiTypes: analysis.removedPiiTypes,
    });
    await this.dependencies.store.awardPoints({
      key: `report:${report.id}:created`,
      driverId: input.driverId,
      points: 10,
      reason: "REPORT_CREATED",
    });

    const storedClaims: StoredClaim[] = [];
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

      if (target && match.relation !== "NEW") {
        if (target.reporterId !== input.driverId) {
          await this.dependencies.store.addEvidence({
            claimId: target.id,
            driverId: input.driverId,
            feedback:
              match.relation === "SUPPORTS" ? "CONFIRM" : "CONTRADICT",
            source: "REPORT",
          });
          storedClaims.push(await this.refreshClaim(target.id));
        } else {
          storedClaims.push(target);
        }
        continue;
      }

      storedClaims.push(
        await this.dependencies.store.createClaim({
          ...candidate,
          vehicleType:
            candidate.vehicleType === "ALL"
              ? input.vehicleType
              : candidate.vehicleType,
          reportId: report.id,
          placeId: input.placeId,
          reporterId: input.driverId,
        }),
      );
    }

    return {
      reportId: report.id,
      claimIds: storedClaims.map((claim) => claim.id),
      claimStatuses: storedClaims.map((claim) => claim.status),
      awardedPoints: 10,
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
      items: verified.slice(0, 5).map((claim) => ({
        claimId: claim.id,
        text: claim.value,
        confidence: claim.confidence,
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
    if (!claim) throw new Error("지식 후보를 찾을 수 없습니다.");
    if (claim.reporterId === input.driverId) {
      throw new Error("제보와 검증은 독립 기사에 의해 수행되어야 합니다.");
    }

    const accepted = await this.dependencies.store.addEvidence({
      ...input,
      source: "DRIVER_FEEDBACK",
    });
    const updated = await this.refreshClaim(claim.id);

    if (accepted && input.feedback === "HELPFUL") {
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
    };
  }

  private async refreshClaim(claimId: string) {
    const claim = await this.dependencies.store.getClaim(claimId);
    if (!claim) throw new Error("지식 후보를 찾을 수 없습니다.");
    const previousStatus = claim.status;
    const evaluated = evaluateClaim(
      claim.reporterId,
      await this.dependencies.store.listEvidence(claim.id),
    );
    const updated = await this.dependencies.store.updateClaim(
      claim.id,
      evaluated,
    );

    if (previousStatus !== "VERIFIED" && updated.status === "VERIFIED") {
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
