import { describe, expect, it } from "vitest";

import {
  KnowledgeAnalysisSchema,
  QuestionPlanSchema,
} from "./contracts";

describe("백엔드 도메인 계약", () => {
  it("1~2개 질문과 질문별 4~5개 선택지만 허용한다", () => {
    const valid = QuestionPlanSchema.parse({
      shouldAsk: true,
      category: "ENTRANCE",
      questions: [
        {
          id: "friction_type",
          question: "오늘 이 배송에서 불편한 점이 있었나요?",
          choices: ["출입구", "정차", "내부 이동", "불편하지 않았어요"],
        },
      ],
    });

    expect(valid.questions).toHaveLength(1);
    expect(() =>
      QuestionPlanSchema.parse({ ...valid, questions: [] }),
    ).toThrow();
    expect(() =>
      QuestionPlanSchema.parse({
        ...valid,
        questions: [
          {
            ...valid.questions[0],
            choices: ["하나", "둘", "불편하지 않았어요"],
          },
        ],
      }),
    ).toThrow();
  });

  it("기사 책임을 묻는 질문을 거부한다", () => {
    expect(() =>
      QuestionPlanSchema.parse({
        shouldAsk: true,
        category: "PARKING",
        questions: [
          {
            id: "friction_type",
            question: "왜 잘못된 곳에 주차했나요?",
            choices: [
              "정차 공간이 없었어요",
              "짐을 내릴 곳이 없었어요",
              "출입구가 멀었어요",
              "불편하지 않았어요",
            ],
          },
        ],
      }),
    ).toThrow(/책임/);
  });

  it("중립 선택지가 빠진 질문을 거부한다", () => {
    expect(() =>
      QuestionPlanSchema.parse({
        shouldAsk: true,
        category: "PARKING",
        questions: [
          {
            id: "friction_type",
            question: "오늘 이 배송에서 불편한 점이 있었나요?",
            choices: [
              "정차 공간이 없었어요",
              "출입구를 찾기 어려웠어요",
              "내부 이동이 어려웠어요",
              "엘리베이터를 기다렸어요",
            ],
          },
        ],
      }),
    ).toThrow(/중립/);
  });

  it("멀티모달 분석 결과를 원자 지식으로 제한한다", () => {
    const parsed = KnowledgeAnalysisSchema.parse({
      sanitizedSummary: "1톤 차량은 후문으로 진입해야 합니다.",
      removedPiiTypes: ["PHONE"],
      claims: [
        {
          type: "ENTRANCE_RECOMMENDATION",
          value: "후문 진입",
          vehicleType: "1TON",
          timeCondition: null,
        },
      ],
    });

    expect(parsed.claims).toHaveLength(1);
    expect(parsed.removedPiiTypes).toEqual(["PHONE"]);
  });
});
