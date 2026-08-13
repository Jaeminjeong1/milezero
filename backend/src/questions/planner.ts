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
    questions: [
      {
        id: "friction_type",
        question: "오늘 이 배송에서 불편한 점이 있었나요?",
        choices: [
          "정차할 곳을 찾기 어려웠어요",
          "짐을 내릴 공간이 부족했어요",
          "출입구를 찾기 어려웠어요",
          "불편하지 않았어요",
        ],
      },
      {
        id: "actionable_detail",
        question: "다음 기사에게 가장 먼저 알려주고 싶은 점은 무엇인가요?",
        choices: [
          "추천 정차 위치",
          "추천 출입구",
          "하역장 위치",
          "건물 내부 이동 방법",
        ],
      },
    ],
  },
  ACCESS: {
    shouldAsk: true,
    category: "ACCESS",
    questions: [
      {
        id: "friction_type",
        question: "배송지에 들어가거나 이동할 때 불편한 점이 있었나요?",
        choices: [
          "출입 절차를 알기 어려웠어요",
          "엘리베이터 이용이 어려웠어요",
          "건물 안에서 길을 찾기 어려웠어요",
          "불편하지 않았어요",
        ],
      },
      {
        id: "actionable_detail",
        question: "다음 기사에게 어떤 안내가 가장 필요할까요?",
        choices: [
          "출입 절차",
          "이용할 엘리베이터",
          "건물 내부 이동 경로",
          "하역장까지 가는 방법",
        ],
      },
    ],
  },
  OTHER: {
    shouldAsk: true,
    category: "OTHER",
    questions: [
      {
        id: "friction_type",
        question: "오늘 이 배송에서 불편한 점이 있었나요?",
        choices: [
          "배송지 시설 때문에 시간이 더 걸렸어요",
          "정차나 하역이 어려웠어요",
          "다른 기사에게 알려주고 싶은 점이 있어요",
          "불편하지 않았어요",
        ],
      },
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
