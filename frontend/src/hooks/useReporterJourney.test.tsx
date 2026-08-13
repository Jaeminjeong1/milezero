// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => vi.useRealTimers());

describe("등록하는 기사 여정", () => {
  it("배송 완료 전에는 질문을 생성하지 않는다", async () => {
    vi.useFakeTimers();
    const api = createApi();
    const { result } = renderHook(() =>
      useReporterJourney(api, { autoDetectDelayMs: 10 }),
    );

    await act(async () => vi.advanceTimersByTimeAsync(10));

    expect(result.current.phase).toBe("friction_detected");
    expect(api.createQuestion).not.toHaveBeenCalled();

    await act(async () => result.current.completeDelivery());

    expect(api.createQuestion).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe("asking");
  });

  it("두 질문의 선택 답변만으로 제보하고 10P를 받는다", async () => {
    const api = createApi();
    const { result } = renderHook(() =>
      useReporterJourney(api, { autoDetectDelayMs: 0 }),
    );

    await waitFor(() => expect(result.current.phase).toBe("friction_detected"));
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
    const { result } = renderHook(() =>
      useReporterJourney(api, { autoDetectDelayMs: 0 }),
    );

    await waitFor(() => expect(result.current.phase).toBe("friction_detected"));
    await act(async () => result.current.completeDelivery());
    act(() => result.current.selectAnswer("불편하지 않았어요"));

    expect(result.current.phase).toBe("no_issue");
    expect(api.submitReport).not.toHaveBeenCalled();
  });
});
