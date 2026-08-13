import { describe, expect, it } from "vitest";

import { evaluateClaim } from "./evaluator";

describe("지식 검증 규칙", () => {
  it("독립 기사 한 명의 확인으로 검증한다", () => {
    expect(
      evaluateClaim("driver-a", [
        { driverId: "driver-b", feedback: "CONFIRM" },
      ]),
    ).toEqual({
      status: "VERIFIED",
      confidence: 0.65,
      helpfulCount: 0,
      notHelpfulCount: 0,
      utilityScore: 0.5,
    });
  });

  it("도움됨만으로는 사실을 검증하지 않는다", () => {
    expect(
      evaluateClaim("driver-a", [
        { driverId: "driver-b", feedback: "HELPFUL" },
      ]),
    ).toEqual({
      status: "CANDIDATE",
      confidence: 0.35,
      helpfulCount: 1,
      notHelpfulCount: 0,
      utilityScore: 0.6,
    });
  });

  it("도움 없음은 사실 상태와 신뢰도를 변경하지 않는다", () => {
    expect(
      evaluateClaim("driver-a", [
        { driverId: "driver-b", feedback: "NOT_HELPFUL" },
      ]),
    ).toEqual({
      status: "CANDIDATE",
      confidence: 0.35,
      helpfulCount: 0,
      notHelpfulCount: 1,
      utilityScore: 0.35,
    });
  });

  it("서로 다른 두 기사의 반대는 충돌로 판정한다", () => {
    expect(
      evaluateClaim("driver-a", [
        { driverId: "driver-b", feedback: "CONTRADICT" },
        { driverId: "driver-c", feedback: "CONTRADICT" },
      ]).status,
    ).toBe("CONFLICT");
  });
});
