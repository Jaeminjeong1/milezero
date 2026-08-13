import { describe, expect, it } from "vitest";

import { planQuestion } from "./planner";

const parkingFriction = {
  detected: true,
  frictionTypes: ["REPEATED_STOPS" as const],
  questionContext: "PARKING" as const,
  reasons: ["정지와 이동이 세 차례 이상 반복됐습니다."],
};

describe("기사 질문 계획", () => {
  it("탐지된 문제가 없으면 질문하지 않는다", async () => {
    const result = await planQuestion(
      { ...parkingFriction, detected: false, frictionTypes: [] },
      async () => {
        throw new Error("호출되면 안 됩니다.");
      },
    );

    expect(result).toBeNull();
  });

  it("책임을 묻는 모델 응답을 중립적인 불편 질문으로 교체한다", async () => {
    const result = await planQuestion(parkingFriction, async () => ({
      shouldAsk: true,
      category: "PARKING",
      question: "왜 잘못된 곳에 주차했나요?",
      choices: ["제가 실수했어요", "불편하지 않았어요"],
    }));

    expect(result?.question).toBe("오늘 이 배송에서 불편한 점이 있었나요?");
    expect(result?.choices).toContain("정차할 곳을 찾기 어려웠어요");
    expect(result?.choices).toContain("불편하지 않았어요");
  });

  it("문제 맥락에 맞는 안전한 모델 질문은 그대로 사용한다", async () => {
    const result = await planQuestion(parkingFriction, async () => ({
      shouldAsk: true,
      category: "PARKING",
      question: "차량을 세우거나 짐을 내릴 때 불편한 점이 있었나요?",
      choices: ["정차 공간이 부족했어요", "출입구가 멀었어요", "불편하지 않았어요"],
    }));

    expect(result?.question).toContain("짐을 내릴 때");
  });
});
