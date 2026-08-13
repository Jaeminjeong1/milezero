import type { Claim, PiiType } from "@/domain/contracts";
import type {
  ClaimEvidence,
  ClaimStatus,
  FeedbackType,
} from "@/validation/evaluator";

export type StoredReport = {
  id: string;
  placeId: string;
  driverId: string;
  sanitizedSummary: string;
  removedPiiTypes: PiiType[];
  createdAt: string;
};

export type StoredClaim = Claim & {
  id: string;
  reportId: string;
  placeId: string;
  reporterId: string;
  status: ClaimStatus;
  confidence: number;
  helpfulCount: number;
  notHelpfulCount: number;
  utilityScore: number;
  createdAt: string;
};

export type StoredEvidence = ClaimEvidence & {
  claimId: string;
  source: "REPORT" | "DRIVER_FEEDBACK";
  createdAt: string;
};

export type PointEntry = {
  key: string;
  driverId: string;
  points: number;
  reason: "REPORT_CREATED" | "CLAIM_VERIFIED" | "GUIDE_HELPFUL";
};

export type ContributionReceipt = {
  reportId: string;
  claimIds: string[];
  claimStatuses: ClaimStatus[];
  awardedPoints: 10;
};

export type ContributionOperation =
  | { kind: "NEW"; claim: Claim }
  | {
      kind: "EVIDENCE";
      claimId: string;
      feedback: Extract<FeedbackType, "CONFIRM" | "CONTRADICT">;
    };

export type CommitContributionInput = {
  idempotencyKey: string;
  placeId: string;
  driverId: string;
  sanitizedSummary: string;
  removedPiiTypes: PiiType[];
  operations: ContributionOperation[];
};

export interface KnowledgeStore {
  getContributionReceipt(
    idempotencyKey: string,
    driverId: string,
  ): Promise<ContributionReceipt | null>;
  commitContribution(
    input: CommitContributionInput,
  ): Promise<ContributionReceipt>;
  createReport(
    report: Omit<StoredReport, "id" | "createdAt">,
  ): Promise<StoredReport>;
  createClaim(
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
  ): Promise<StoredClaim>;
  findClaims(input: {
    placeId: string;
    type?: Claim["type"];
    vehicleType?: Claim["vehicleType"];
    statuses?: ClaimStatus[];
  }): Promise<StoredClaim[]>;
  getClaim(claimId: string): Promise<StoredClaim | null>;
  updateClaim(
    claimId: string,
    update: Pick<
      StoredClaim,
      | "status"
      | "confidence"
      | "helpfulCount"
      | "notHelpfulCount"
      | "utilityScore"
    >,
  ): Promise<StoredClaim>;
  addEvidence(input: {
    claimId: string;
    driverId: string;
    feedback: FeedbackType;
    source: StoredEvidence["source"];
  }): Promise<boolean>;
  listEvidence(claimId: string): Promise<StoredEvidence[]>;
  awardPoints(entry: PointEntry): Promise<boolean>;
  getPointBalance(driverId: string): Promise<number>;
}
