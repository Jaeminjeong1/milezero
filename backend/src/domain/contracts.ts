import { z } from "zod";

const blamingQuestionPattern = /(왜.*잘못|기사.*책임|기사님.*실수|실수했|헤맸)/;

export const QuestionItemSchema = z.object({
  id: z.string().min(1).max(40),
  question: z.string().min(1).max(120),
  choices: z.array(z.string().min(1).max(50)).min(4).max(5),
});

export const QuestionPlanSchema = z
  .object({
    shouldAsk: z.boolean(),
    category: z.enum([
      "PARKING",
      "ENTRANCE",
      "ACCESS",
      "ELEVATOR",
      "INTERNAL_ROUTE",
      "OTHER",
    ]),
    questions: z.array(QuestionItemSchema).min(1).max(2),
  })
  .superRefine((plan, context) => {
    for (const [index, item] of plan.questions.entries()) {
      if (
        blamingQuestionPattern.test(
          `${item.question} ${item.choices.join(" ")}`,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["questions", index],
          message: "배송기사의 책임을 묻는 질문은 사용할 수 없습니다.",
        });
      }
    }

    if (!plan.questions[0]?.choices.includes("불편하지 않았어요")) {
      context.addIssue({
        code: "custom",
        path: ["questions", 0, "choices"],
        message: "불편이 없었음을 표현하는 중립 선택지가 필요합니다.",
      });
    }
  });

export const ClaimSchema = z.object({
  type: z.enum([
    "ENTRANCE_RECOMMENDATION",
    "UNLOADING_LOCATION",
    "VEHICLE_RESTRICTION",
    "ACCESS_PROCEDURE",
    "ELEVATOR_GUIDE",
    "INTERNAL_ROUTE",
  ]),
  value: z.string().min(1).max(240),
  vehicleType: z.enum(["ALL", "BIKE", "CAR", "VAN", "1TON"]),
  timeCondition: z.string().max(80).nullable(),
});

export const PiiTypeSchema = z.enum([
  "NAME",
  "PHONE",
  "EMAIL",
  "RESIDENT_ID",
  "ACCOUNT",
  "UNIT",
  "PASSWORD",
  "FACE",
  "PLATE",
  "EXIF",
]);

export const KnowledgeAnalysisSchema = z.object({
  sanitizedSummary: z.string().max(500),
  removedPiiTypes: z.array(PiiTypeSchema),
  claims: z.array(ClaimSchema).max(8),
});

export type QuestionPlan = z.infer<typeof QuestionPlanSchema>;
export type QuestionItem = z.infer<typeof QuestionItemSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type PiiType = z.infer<typeof PiiTypeSchema>;
export type KnowledgeAnalysis = z.infer<typeof KnowledgeAnalysisSchema>;
