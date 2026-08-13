export type FeedbackType =
  | "CONFIRM"
  | "CONTRADICT"
  | "HELPFUL"
  | "NOT_HELPFUL";
export type ClaimStatus = "CANDIDATE" | "VERIFIED" | "CONFLICT";

export type ClaimEvidence = {
  driverId: string;
  feedback: FeedbackType;
};

export function evaluateClaim(
  reporterId: string,
  evidence: ClaimEvidence[],
): {
  status: ClaimStatus;
  confidence: number;
  helpfulCount: number;
  notHelpfulCount: number;
  utilityScore: number;
} {
  const independent = evidence.filter(
    (item) => item.driverId !== reporterId,
  );
  const confirmCount = new Set(
    independent
      .filter((item) => item.feedback === "CONFIRM")
      .map((item) => item.driverId),
  ).size;
  const contradictCount = new Set(
    independent
      .filter((item) => item.feedback === "CONTRADICT")
      .map((item) => item.driverId),
  ).size;
  const helpfulCount = new Set(
    independent
      .filter((item) => item.feedback === "HELPFUL")
      .map((item) => item.driverId),
  ).size;
  const notHelpfulCount = new Set(
    independent
      .filter((item) => item.feedback === "NOT_HELPFUL")
      .map((item) => item.driverId),
  ).size;
  const confidence = Math.max(
    0,
    Math.min(
      1,
      0.35 + confirmCount * 0.3 - contradictCount * 0.25,
    ),
  );
  const roundedConfidence = Math.round(confidence * 100) / 100;
  const utilityScore = Math.max(
    0,
    Math.min(1, 0.5 + helpfulCount * 0.1 - notHelpfulCount * 0.15),
  );
  const roundedUtilityScore = Math.round(utilityScore * 100) / 100;

  const evaluation = {
    confidence: roundedConfidence,
    helpfulCount,
    notHelpfulCount,
    utilityScore: roundedUtilityScore,
  };

  if (contradictCount >= 2) {
    return {
      status: "CONFLICT",
      ...evaluation,
    };
  }
  if (confirmCount >= 1) {
    return {
      status: "VERIFIED",
      ...evaluation,
    };
  }
  return {
    status: "CANDIDATE",
    ...evaluation,
  };
}
