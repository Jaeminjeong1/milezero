// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MileZeroApi, QuestionPlan } from "../types";
import { useDemoJourney } from "./useDemoJourney";

const question: QuestionPlan = {
  shouldAsk: true,
  category: "ENTRANCE",
  question: "오늘 이 배송에서 불편한 점이 있었나요?",
  choices: ["출입구를 찾기 어려웠어요", "불편하지 않았어요"],
};

function createApi(overrides: Partial<MileZeroApi> = {}): MileZeroApi {
  return {
    createQuestion: vi.fn(async () => question),
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

describe("자동 감지와 제보 여정", () => {
  it("지연 뒤 GPS 집계 특징으로 질문을 열고 선택 후 제보 단계로 이동한다", async () => {
    vi.useFakeTimers();
    const api = createApi();
    const { result } = renderHook(() =>
      useDemoJourney(api, { autoDetectDelayMs: 800 }),
    );

    expect(result.current.phase).toBe("detecting");
    await act(async () => vi.advanceTimersByTimeAsync(800));

    expect(api.createQuestion).toHaveBeenCalledWith({
      dwellSeconds: 420,
      stopCount: 3,
      travelMeters: 90,
      displacementMeters: 20,
      acceptedSampleCount: 8,
    });
    expect(result.current.phase).toBe("question");

    act(() => result.current.selectChoice("출입구를 찾기 어려웠어요"));
    expect(result.current.phase).toBe("contribution");
    expect(result.current.selectedChoice).toBe("출입구를 찾기 어려웠어요");
  });

  it("제보를 제출하고 기본 10포인트 영수증을 표시한다", async () => {
    vi.useFakeTimers();
    const api = createApi();
    const { result } = renderHook(() =>
      useDemoJourney(api, { autoDetectDelayMs: 0 }),
    );
    await act(async () => vi.runAllTimersAsync());
    act(() => result.current.selectChoice("출입구를 찾기 어려웠어요"));

    await act(async () =>
      result.current.submitContribution({ text: "정문 말고 후문으로 들어가야 해요." }),
    );

    expect(result.current.phase).toBe("rewarded");
    expect(result.current.receipt?.awardedPoints).toBe(10);
    expect(api.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        driverId: "demo-driver-a",
        placeId: "demo-office-tower",
        contribution: {
          answerChoice: "출입구를 찾기 어려웠어요",
          text: "정문 말고 후문으로 들어가야 해요.",
        },
      }),
    );
  });

  it("실패한 제보 재시도에는 같은 멱등 키를 재사용한다", async () => {
    vi.useFakeTimers();
    const submitReport = vi
      .fn<MileZeroApi["submitReport"]>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        reportId: "report-1",
        claimIds: ["claim-1"],
        claimStatuses: ["CANDIDATE"],
        awardedPoints: 10,
      });
    const { result } = renderHook(() =>
      useDemoJourney(createApi({ submitReport }), { autoDetectDelayMs: 0 }),
    );
    await act(async () => vi.runAllTimersAsync());
    act(() => result.current.selectChoice("출입구를 찾기 어려웠어요"));
    await act(async () =>
      result.current.submitContribution({ text: "후문으로 들어가세요." }),
    );
    expect(result.current.phase).toBe("error");

    await act(async () => result.current.retrySubmission());

    expect(result.current.phase).toBe("rewarded");
    expect(submitReport.mock.calls[0][0].idempotencyKey).toBe(
      submitReport.mock.calls[1][0].idempotencyKey,
    );
  });

  it("8MB를 넘는 파일은 API 호출 전에 거부한다", async () => {
    vi.useFakeTimers();
    const api = createApi();
    const { result } = renderHook(() =>
      useDemoJourney(api, { autoDetectDelayMs: 0 }),
    );
    await act(async () => vi.runAllTimersAsync());
    act(() => result.current.selectChoice("출입구를 찾기 어려웠어요"));
    const largeFile = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.jpg", {
      type: "image/jpeg",
    });

    await act(async () =>
      result.current.submitContribution({ text: "후문", file: largeFile }),
    );

    expect(result.current.phase).toBe("error");
    expect(result.current.errorMessage).toMatch(/8MB/);
    expect(api.submitReport).not.toHaveBeenCalled();
  });
});
