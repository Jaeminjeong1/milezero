import { QuestionPlanSchema, type QuestionPlan } from "@/domain/contracts";
import type { FrictionDecision } from "@/friction/types";

export type QuestionGenerator = (input: {
  context: FrictionDecision["questionContext"];
  frictionTypes: FrictionDecision["frictionTypes"];
  reasons: string[];
}) => Promise<unknown>;

const fallbackByContext: Record<
  FrictionDecision["questionContext"],
  QuestionPlan
> = {
  PARKING: {
    shouldAsk: true,
    category: "PARKING",
    question: "오늘 이 배송에서 불편한 점이 있었나요?",
    choices: [
      "정차할 곳을 찾기 어려웠어요",
      "짐을 내릴 공간이 부족했어요",
      "출입구를 찾기 어려웠어요",
      "불편하지 않았어요",
    ],
  },
  ACCESS: {
    shouldAsk: true,
    category: "ACCESS",
    question: "배송지에 들어가거나 이동할 때 불편한 점이 있었나요?",
    choices: [
      "출입 절차를 알기 어려웠어요",
      "엘리베이터 이용이 어려웠어요",
      "건물 안에서 길을 찾기 어려웠어요",
      "불편하지 않았어요",
    ],
  },
  OTHER: {
    shouldAsk: true,
    category: "OTHER",
    question: "오늘 이 배송에서 불편한 점이 있었나요?",
    choices: [
      "배송지 시설 때문에 시간이 더 걸렸어요",
      "다른 기사에게 알려주고 싶은 점이 있어요",
      "불편하지 않았어요",
    ],
  },
};

export async function planQuestion(
  decision: FrictionDecision,
  generate: QuestionGenerator,
): Promise<QuestionPlan | null> {
  if (!decision.detected) return null;

  try {
    return QuestionPlanSchema.parse(
      await generate({
        context: decision.questionContext,
        frictionTypes: decision.frictionTypes,
        reasons: decision.reasons,
      }),
    );
  } catch {
    return fallbackByContext[decision.questionContext];
  }
}
