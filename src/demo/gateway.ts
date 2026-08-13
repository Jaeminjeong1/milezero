import type { KnowledgeAnalysis, QuestionPlan } from "@/domain/contracts";
import type { AnalysisModelInput } from "@/knowledge/analyzer";
import type { ClaimMatcher } from "@/pipeline/pipeline";
import type { QuestionGenerator } from "@/questions/planner";

export function createDemoGateway() {
  const generateQuestion: QuestionGenerator = async ({ context }) => ({
    shouldAsk: true,
    category: context === "OTHER" ? "OTHER" : context,
    question: "오늘 이 배송에서 불편한 점이 있었나요?",
    choices: [
      "출입구를 찾기 어려웠어요",
      "정차할 곳을 찾기 어려웠어요",
      "건물 안에서 이동이 어려웠어요",
      "불편하지 않았어요",
    ],
  } satisfies QuestionPlan);

  const generateKnowledge = async (
    input: AnalysisModelInput,
  ): Promise<KnowledgeAnalysis> => {
    const actionable =
      input.answerChoice !== "불편하지 않았어요" ||
      input.sanitizedText.trim().length > 0;
    return {
      sanitizedSummary: actionable
        ? "1톤 차량은 후문으로 진입하면 편리합니다."
        : "재사용 가능한 배송지 정보가 없습니다.",
      removedPiiTypes: [],
      claims: actionable
        ? [
            {
              type: "ENTRANCE_RECOMMENDATION",
              value: "1톤 차량은 후문으로 진입",
              vehicleType: "1TON",
              timeCondition: null,
            },
          ]
        : [],
    };
  };

  const matchClaim: ClaimMatcher = async (candidate, existing) => {
    const match = existing.find(
      (claim) =>
        claim.type === candidate.type && claim.value === candidate.value,
    );
    return match
      ? { relation: "SUPPORTS", targetClaimId: match.id }
      : { relation: "NEW", targetClaimId: null };
  };

  return { generateQuestion, generateKnowledge, matchClaim };
}
