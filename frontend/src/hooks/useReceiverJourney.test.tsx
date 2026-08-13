// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MileZeroApi } from "../types";
import { useReceiverJourney } from "./useReceiverJourney";

function feedbackResult() {
  return {
    accepted: true,
    status: "VERIFIED" as const,
    confidence: 0.65,
    helpfulCount: 0,
    notHelpfulCount: 0,
    utilityScore: 0.5,
  };
}

function createApi(overrides: Partial<MileZeroApi> = {}): MileZeroApi {
  return {
    resetSimulation: vi.fn(async () => ({ reset: true as const })),
    evaluateFriction: vi.fn<MileZeroApi["evaluateFriction"]>(async () => ({
      detected: true,
      frictionTypes: ["REPEATED_STOPS"],
      questionContext: "PARKING",
      reasons: ["정지와 이동이 세 차례 이상 반복됐습니다."],
    })),
    createQuestion: vi.fn(async () => null),
    submitReport: vi.fn(),
    getKnowledge: vi.fn<MileZeroApi["getKnowledge"]>(async () => ({
      items: [
        {
          claimId: "demo-guide-claim",
          text: "1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요",
          type: "INTERNAL_ROUTE",
          vehicleType: "1TON",
          timeCondition: null,
          confidence: 0.65,
          reportedAt: "2026-08-13T00:00:00.000Z",
        },
      ],
      pendingConfirmation: null,
    })),
    recordFeedback: vi.fn(async () => feedbackResult()),
    ...overrides,
  };
}

describe("도움 받는 기사 여정", () => {
  it("후보 지식을 오류로 처리하지 않고 독립 확인 후 정식 가이드를 불러온다", async () => {
    const getKnowledge = vi
      .fn<MileZeroApi["getKnowledge"]>()
      .mockResolvedValueOnce({
        items: [],
        pendingConfirmation: {
          claimId: "candidate-claim",
          text: "1톤 차량은 후문으로 진입하세요",
        },
      })
      .mockResolvedValueOnce({
        items: [
          {
            claimId: "candidate-claim",
            text: "1톤 차량은 후문으로 진입하세요",
            type: "ENTRANCE_RECOMMENDATION",
            vehicleType: "1TON",
            timeCondition: null,
            confidence: 0.65,
            reportedAt: "2026-08-13T00:00:00.000Z",
          },
        ],
        pendingConfirmation: null,
      });
    const api = createApi({ getKnowledge });
    const { result } = renderHook(() => useReceiverJourney(api));

    await act(async () => result.current.openGuide());

    expect(result.current.phase).toBe("pending_confirmation");
    expect(result.current.pendingConfirmation?.text).toContain("후문");
    expect(result.current.errorMessage).toBeUndefined();

    await act(async () => result.current.answerPending("CONFIRM"));

    expect(result.current.phase).toBe("guide_ready");
    expect(result.current.guide?.text).toContain("후문");
    expect(api.recordFeedback).toHaveBeenCalledWith({
      driverId: "demo-driver-b",
      claimId: "candidate-claim",
      feedback: "CONFIRM",
    });
  });

  it("안내를 먼저 보여주고 배송 완료 후 사실과 유용성을 순서대로 받는다", async () => {
    const api = createApi();
    const { result } = renderHook(() => useReceiverJourney(api));

    await act(async () => result.current.openGuide());
    expect(result.current.phase).toBe("guide_ready");
    expect(result.current.guide?.text).toContain("B2");

    act(() => result.current.completeDelivery());
    expect(result.current.phase).toBe("fact_feedback");
    await act(async () => result.current.answerFact("CONFIRM"));
    expect(result.current.phase).toBe("utility_feedback");
    await act(async () => result.current.answerUtility("HELPFUL"));
    expect(result.current.phase).toBe("feedback_complete");
  });

  it("유용성 전송만 실패하면 재시도에서 사실 피드백을 중복 전송하지 않는다", async () => {
    const recordFeedback = vi
      .fn<MileZeroApi["recordFeedback"]>()
      .mockResolvedValueOnce(feedbackResult())
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(feedbackResult());
    const api = createApi({ recordFeedback });
    const { result } = renderHook(() => useReceiverJourney(api));

    await act(async () => result.current.openGuide());
    act(() => result.current.completeDelivery());
    await act(async () => result.current.answerFact("CONFIRM"));
    await act(async () => result.current.answerUtility("NOT_HELPFUL"));
    expect(result.current.phase).toBe("error");

    await act(async () => result.current.retryFeedback());

    expect(result.current.phase).toBe("feedback_complete");
    expect(recordFeedback).toHaveBeenCalledTimes(3);
    expect(recordFeedback.mock.calls.filter(([input]) => input.feedback === "CONFIRM")).toHaveLength(1);
    expect(recordFeedback.mock.calls.filter(([input]) => input.feedback === "NOT_HELPFUL")).toHaveLength(2);
  });

  it("반복 시연을 위해 화면 상태만 처음으로 되돌린다", async () => {
    const { result } = renderHook(() => useReceiverJourney(createApi()));

    await act(async () => result.current.openGuide());
    act(() => result.current.completeDelivery());
    await act(async () => result.current.answerFact("CONFIRM"));

    act(() => result.current.reset());

    expect(result.current.phase).toBe("idle");
    expect(result.current.guide).toBeNull();
    expect(result.current.factFeedback).toBeUndefined();
    expect(result.current.utilityFeedback).toBeUndefined();
  });
});
