export type FeedbackType = "CONFIRM" | "CONTRADICT" | "HELPFUL";
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
  const confidence = Math.max(
    0,
    Math.min(
      1,
      0.35 +
        confirmCount * 0.3 +
        helpfulCount * 0.1 -
        contradictCount * 0.25,
    ),
  );
  const roundedConfidence = Math.round(confidence * 100) / 100;

  if (contradictCount >= 2) {
    return {
      status: "CONFLICT",
      confidence: roundedConfidence,
      helpfulCount,
    };
  }
  if (confirmCount >= 1) {
    return {
      status: "VERIFIED",
      confidence: roundedConfidence,
      helpfulCount,
    };
  }
  return {
    status: "CANDIDATE",
    confidence: roundedConfidence,
    helpfulCount,
  };
}
