import type { Claim } from "@/domain/contracts";
import type { ClaimStatus, FeedbackType } from "@/validation/evaluator";

import type {
  CommitContributionInput,
  ContributionReceipt,
  KnowledgeStore,
  PointEntry,
  StoredClaim,
  StoredEvidence,
  StoredReport,
} from "./contracts";

export class InMemoryKnowledgeStore implements KnowledgeStore {
  private reportSequence = 0;
  private claimSequence = 0;
  private reports: StoredReport[] = [];
  private claims: StoredClaim[] = [];
  private evidence: StoredEvidence[] = [];
  private points: PointEntry[] = [];
  private contributionReceipts = new Map<string, ContributionReceipt>();

  async getContributionReceipt(
    idempotencyKey: string,
    driverId: string,
  ): Promise<ContributionReceipt | null> {
    const stored = this.contributionReceipts.get(
      `${driverId}:${idempotencyKey}`,
    );
    return stored ? structuredClone(stored) : null;
  }

  async commitContribution(
    input: CommitContributionInput,
  ): Promise<ContributionReceipt> {
    const receiptKey = `${input.driverId}:${input.idempotencyKey}`;
    const existing = this.contributionReceipts.get(receiptKey);
    if (existing) return structuredClone(existing);

    const checkpoint = structuredClone({
      reportSequence: this.reportSequence,
      claimSequence: this.claimSequence,
      reports: this.reports,
      claims: this.claims,
      evidence: this.evidence,
      points: this.points,
    });
    try {
      const report = await this.createReport({
        placeId: input.placeId,
        driverId: input.driverId,
        sanitizedSummary: input.sanitizedSummary,
        removedPiiTypes: input.removedPiiTypes,
      });
      const claimIds: string[] = [];
      for (const operation of input.operations) {
        if (operation.kind === "NEW") {
          const claim = await this.createClaim({
            ...operation.claim,
            reportId: report.id,
            placeId: input.placeId,
            reporterId: input.driverId,
          });
          claimIds.push(claim.id);
        } else {
          const target = await this.getClaim(operation.claimId);
          if (!target) throw new Error("지식 후보를 찾을 수 없습니다.");
          claimIds.push(target.id);
          if (target.reporterId !== input.driverId) {
            await this.addEvidence({
              claimId: target.id,
              driverId: input.driverId,
              feedback: operation.feedback,
              source: "REPORT",
            });
          }
        }
      }
      await this.awardPoints({
        key: `report:${report.id}:created`,
        driverId: input.driverId,
        points: 10,
        reason: "REPORT_CREATED",
      });
      const claims = await Promise.all(claimIds.map((id) => this.getClaim(id)));
      const receipt: ContributionReceipt = {
        reportId: report.id,
        claimIds,
        claimStatuses: claims.map((claim) => claim!.status),
        awardedPoints: 10,
      };
      this.contributionReceipts.set(receiptKey, receipt);
      return structuredClone(receipt);
    } catch (error) {
      this.reportSequence = checkpoint.reportSequence;
      this.claimSequence = checkpoint.claimSequence;
      this.reports = checkpoint.reports;
      this.claims = checkpoint.claims;
      this.evidence = checkpoint.evidence;
      this.points = checkpoint.points;
      throw error;
    }
  }

  async createReport(
    report: Omit<StoredReport, "id" | "createdAt">,
  ): Promise<StoredReport> {
    const stored = {
      ...report,
      id: `report-${++this.reportSequence}`,
      createdAt: new Date().toISOString(),
    };
    this.reports.push(stored);
    return structuredClone(stored);
  }

  async createClaim(
    claim: Omit<
      StoredClaim,
      "id" | "status" | "confidence" | "helpfulCount" | "createdAt"
    >,
  ): Promise<StoredClaim> {
    const stored: StoredClaim = {
      ...claim,
      id: `claim-${++this.claimSequence}`,
      status: "CANDIDATE",
      confidence: 0.35,
      helpfulCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.claims.push(stored);
    return structuredClone(stored);
  }

  async findClaims(input: {
    placeId: string;
    type?: Claim["type"];
    vehicleType?: Claim["vehicleType"];
    statuses?: ClaimStatus[];
  }): Promise<StoredClaim[]> {
    return structuredClone(
      this.claims.filter(
        (claim) =>
          claim.placeId === input.placeId &&
          (!input.type || claim.type === input.type) &&
          (!input.vehicleType ||
            claim.vehicleType === input.vehicleType ||
            claim.vehicleType === "ALL") &&
          (!input.statuses || input.statuses.includes(claim.status)),
      ),
    );
  }

  async getClaim(claimId: string): Promise<StoredClaim | null> {
    const claim = this.claims.find((item) => item.id === claimId);
    return claim ? structuredClone(claim) : null;
  }

  async updateClaim(
    claimId: string,
    update: Pick<StoredClaim, "status" | "confidence" | "helpfulCount">,
  ): Promise<StoredClaim> {
    const claim = this.claims.find((item) => item.id === claimId);
    if (!claim) throw new Error("지식 후보를 찾을 수 없습니다.");
    Object.assign(claim, update);
    return structuredClone(claim);
  }

  async addEvidence(input: {
    claimId: string;
    driverId: string;
    feedback: FeedbackType;
    source: StoredEvidence["source"];
  }): Promise<boolean> {
    const isFactFeedback = input.feedback !== "HELPFUL";
    const duplicate = this.evidence.some(
      (item) =>
        item.claimId === input.claimId &&
        item.driverId === input.driverId &&
        (item.feedback === input.feedback ||
          (isFactFeedback && item.feedback !== "HELPFUL")),
    );
    if (duplicate) return false;
    this.evidence.push({
      ...input,
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  async listEvidence(claimId: string): Promise<StoredEvidence[]> {
    return structuredClone(
      this.evidence.filter((item) => item.claimId === claimId),
    );
  }

  async awardPoints(entry: PointEntry): Promise<boolean> {
    if (this.points.some((item) => item.key === entry.key)) return false;
    this.points.push(structuredClone(entry));
    return true;
  }

  async getPointBalance(driverId: string): Promise<number> {
    return this.points
      .filter((item) => item.driverId === driverId)
      .reduce((total, item) => total + item.points, 0);
  }

  snapshot() {
    return structuredClone({
      reports: this.reports,
      claims: this.claims,
      evidence: this.evidence,
      points: this.points,
    });
  }
}
