// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MileZeroApi, QuestionPlan } from "../types";
import { useReporterJourney } from "./useReporterJourney";

const questionPlan: QuestionPlan = {
  shouldAsk: true,
  category: "ENTRANCE",
  questions: [
    {
      id: "friction_type",
      question: "오늘 이 배송에서 불편한 점이 있었나요?",
      choices: [
        "출입구를 찾기 어려웠어요",
        "정차가 어려웠어요",
        "내부 이동이 어려웠어요",
        "불편하지 않았어요",
      ],
    },
    {
      id: "actionable_detail",
      question: "다음 기사에게 가장 먼저 알려줄 점은 무엇인가요?",
      choices: ["후문 위치", "정차 위치", "하역장 위치", "내부 이동 경로"],
    },
  ],
};

function createApi(overrides: Partial<MileZeroApi> = {}): MileZeroApi {
  return {
    resetSimulation: vi.fn(async () => ({ reset: true as const })),
    evaluateFriction: vi.fn<MileZeroApi["evaluateFriction"]>(async () => ({
      detected: true,
      frictionTypes: ["REPEATED_STOPS"],
      questionContext: "PARKING",
      reasons: ["정지와 이동이 세 차례 이상 반복됐습니다."],
    })),
    createQuestion: vi.fn(async () => questionPlan),
    submitReport: vi.fn<MileZeroApi["submitReport"]>(async () => ({
      reportId: "report-1",
      claimIds: ["claim-1"],
      claimStatuses: ["CANDIDATE"],
      awardedPoints: 10,
    })),
    getKnowledge: vi.fn(async () => ({ items: [], pendingConfirmation: null })),
    recordFeedback: vi.fn(),
    ...overrides,
  };
}

describe("등록하는 기사 여정", () => {
  it("GPS 시나리오를 실제 집계하고 서버 판정 뒤에만 질문을 생성한다", async () => {
    const api = createApi();
    const { result } = renderHook(() => useReporterJourney(api));

    expect(result.current.phase).toBe("delivering");
    await act(async () => result.current.triggerScenario("WANDERING"));

    expect(result.current.phase).toBe("friction_detected");
    expect(api.evaluateFriction).toHaveBeenCalledWith(
      expect.objectContaining({ stopCount: 3, acceptedSampleCount: 8 }),
    );
    expect(result.current.decision?.questionContext).toBe("PARKING");
    expect(api.createQuestion).not.toHaveBeenCalled();

    await act(async () => result.current.completeDelivery());

    expect(api.createQuestion).toHaveBeenCalledWith(result.current.features);
    expect(result.current.phase).toBe("asking");
  });

  it("두 질문의 선택 답변만으로 제보하고 10P를 받는다", async () => {
    const api = createApi();
    const { result } = renderHook(() => useReporterJourney(api));

    await act(async () => result.current.triggerScenario("WANDERING"));
    await act(async () => result.current.completeDelivery());
    act(() => result.current.selectAnswer("출입구를 찾기 어려웠어요"));
    expect(result.current.currentQuestionIndex).toBe(1);
    act(() => result.current.selectAnswer("후문 위치"));
    expect(result.current.phase).toBe("optional_detail");

    await act(async () => result.current.submitContribution({}));

    expect(api.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        contribution: {
          answers: [
            expect.objectContaining({
              questionId: "friction_type",
              choice: "출입구를 찾기 어려웠어요",
            }),
            expect.objectContaining({
              questionId: "actionable_detail",
              choice: "후문 위치",
            }),
          ],
          text: undefined,
          media: undefined,
        },
      }),
    );
    expect(result.current.phase).toBe("rewarded");
  });

  it("불편하지 않았다는 첫 답변은 제보와 포인트 없이 종료한다", async () => {
    const api = createApi();
    const { result } = renderHook(() => useReporterJourney(api));

    await act(async () => result.current.triggerScenario("LONG_STOP"));
    await act(async () => result.current.completeDelivery());
    act(() => result.current.selectAnswer("불편하지 않았어요"));

    expect(result.current.phase).toBe("no_issue");
    expect(api.submitReport).not.toHaveBeenCalled();
  });

  it("탐지되지 않은 서버 판정은 배송 완료 질문으로 넘어가지 않는다", async () => {
    const api = createApi({
      evaluateFriction: vi.fn<MileZeroApi["evaluateFriction"]>(async () => ({
        detected: false,
        frictionTypes: [],
        questionContext: "OTHER",
        reasons: ["이상 행동 기준에 해당하지 않습니다."],
      })),
    });
    const { result } = renderHook(() => useReporterJourney(api));

    await act(async () => result.current.triggerScenario("ACCESS_RETRY"));

    expect(result.current.phase).toBe("friction_not_detected");
    await act(async () => result.current.completeDelivery());
    expect(api.createQuestion).not.toHaveBeenCalled();
  });
});
