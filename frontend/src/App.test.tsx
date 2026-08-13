// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MileZeroApi } from "./types";
import { App } from "./App";
import { ApiError } from "./api";

function createApi(overrides: Partial<MileZeroApi> = {}): MileZeroApi {
  return {
    resetSimulation: vi.fn(async () => ({ reset: true as const })),
    evaluateFriction: vi.fn<MileZeroApi["evaluateFriction"]>(async () => ({
      detected: true,
      frictionTypes: ["REPEATED_STOPS"],
      questionContext: "PARKING",
      reasons: ["정지와 이동이 세 차례 이상 반복됐습니다."],
    })),
    createQuestion: vi.fn<MileZeroApi["createQuestion"]>(async () => ({
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
    })),
    submitReport: vi.fn<MileZeroApi["submitReport"]>(async () => ({
      reportId: "report-1",
      claimIds: ["claim-1"],
      claimStatuses: ["CANDIDATE"],
      awardedPoints: 10,
    })),
    getKnowledge: vi.fn<MileZeroApi["getKnowledge"]>(async () => ({
      items: [
        {
          claimId: "demo-guide-claim",
          text: "1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요",
          type: "ENTRANCE_RECOMMENDATION",
          vehicleType: "VAN",
          timeCondition: "평일 09:00~18:00",
          confidence: 0.65,
          reportedAt: "2026-08-13T00:00:00.000Z",
        },
      ],
      pendingConfirmation: null,
    })),
    recordFeedback: vi.fn(),
    ...overrides,
  };
}

describe("MileZero 역할별 홈", () => {
  it("두 기사 역할과 공통 현장 경험 메시지를 보여준다", async () => {
    const user = userEvent.setup();
    render(<App api={createApi()} />);

    expect(screen.getByRole("tab", { name: "등록하는 기사" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "도움 받는 기사" })).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "마지막 구간은 현장 경험이 안내할게요.",
      }),
    ).toBeVisible();
    expect(screen.getByText("배송 완료 후 질문")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /주변을 서성임/ }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("button", { name: /정차 후 완료 지연/ }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("button", { name: /출입구 반복 탐색/ }),
    ).not.toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: "도움 받는 기사" }));

    expect(
      screen.getByRole("heading", {
        name: "마지막 구간은 현장 경험이 안내할게요.",
      }),
    ).toBeVisible();
  });

  it("배송 완료 뒤 두 질문을 받고 선택 답변만으로 10P를 지급한다", async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(
      screen.getAllByRole("button", { name: /주변을 서성임/ })[0],
    );
    expect(
      await screen.findByText("정지와 이동이 세 차례 이상 반복됐습니다."),
    ).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "배송 완료했어요" }));
    expect(
      await screen.findByRole("heading", {
        name: "오늘 이 배송에서 불편한 점이 있었나요?",
      }),
    ).toBeVisible();
    expect(screen.getByText("1/2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "출입구를 찾기 어려웠어요" }));
    expect(screen.getByText("2/2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "후문 위치" }));
    await user.click(
      screen.getByRole("button", { name: "선택 답변만 보내고 10P 받기" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "10P가 바로 쌓였어요" })).toBeVisible(),
    );
    expect(api.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        contribution: expect.objectContaining({ answers: expect.any(Array) }),
      }),
    );
  });

  it("불편하지 않았다는 답변은 제보를 만들지 않는다", async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(
      screen.getAllByRole("button", { name: /정차 후 완료 지연/ })[0],
    );
    await user.click(await screen.findByRole("button", { name: "배송 완료했어요" }));
    await user.click(
      await screen.findByRole("button", { name: "불편하지 않았어요" }),
    );

    expect(await screen.findByText("불편 없음으로 기록했어요")).toBeVisible();
    expect(api.submitReport).not.toHaveBeenCalled();
  });

  it("사전 가이드를 보여준 뒤 배송 완료 후 사실과 도움 여부를 따로 묻는다", async () => {
    const api = createApi();
    api.recordFeedback = vi.fn<MileZeroApi["recordFeedback"]>(async () => ({
      accepted: true,
      status: "VERIFIED",
      confidence: 0.65,
      helpfulCount: 0,
      notHelpfulCount: 1,
      utilityScore: 0.35,
    }));
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(screen.getByRole("tab", { name: "도움 받는 기사" }));
    expect(
      await screen.findByText(
        "1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요",
      ),
    ).toBeVisible();
    expect(screen.getByText("추천 진입 경로")).toBeVisible();
    expect(screen.getByText("승합차")).toBeVisible();
    expect(screen.getByText("평일 09:00~18:00")).toBeVisible();
    expect(screen.getByText("기사 제보 · 독립 확인 완료")).toBeVisible();
    expect(screen.queryByText("합성 시나리오")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "안내받은 정보가 실제 현장과 같았나요?",
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "배송 완료했어요" }));
    expect(
      screen.getByRole("heading", {
        name: "안내받은 정보가 실제 현장과 같았나요?",
      }),
    ).toBeVisible();
    let feedbackDialog = screen.getByRole("dialog");
    expect(within(feedbackDialog).getByText("1/2 · 사실 확인")).toBeVisible();
    expect(
      within(feedbackDialog).getByText(
        "1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "정보가 달랐어요" }));
    expect(
      await screen.findByRole("heading", {
        name: "이 안내가 배송에 도움이 됐나요?",
      }),
    ).toBeVisible();
    feedbackDialog = screen.getByRole("dialog");
    expect(within(feedbackDialog).getByText("2/2 · 도움 확인")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "도움은 없었어요" }));

    expect(
      await screen.findByText(
        "변경 신호를 저장했어요. 독립 확인 2건이면 안내를 중단해요.",
      ),
    ).toBeVisible();
    expect(api.recordFeedback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ feedback: "CONTRADICT" }),
    );
    expect(api.recordFeedback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ feedback: "NOT_HELPFUL" }),
    );
  });

  it("후보 지식을 독립 확인하면 검증된 가이드로 전환한다", async () => {
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
    const api = createApi({
      getKnowledge,
      recordFeedback: vi.fn<MileZeroApi["recordFeedback"]>(async () => ({
        accepted: true,
        status: "VERIFIED",
        confidence: 0.65,
        helpfulCount: 0,
        notHelpfulCount: 0,
        utilityScore: 0.5,
      })),
    });
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(screen.getByRole("tab", { name: "도움 받는 기사" }));

    expect(await screen.findByRole("heading", { name: "현재도 맞나요?" })).toBeVisible();
    expect(screen.getByText("1톤 차량은 후문으로 진입하세요")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "맞아요" }));

    expect(await screen.findByRole("heading", { name: "출발 전 현장 가이드" })).toBeVisible();
    expect(screen.getByText("1톤 차량은 후문으로 진입하세요")).toBeVisible();
  });

  it("서버 데이터를 모두 지우고 두 기사 화면을 첫 상태로 되돌린다", async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(
      screen.getAllByRole("button", { name: /출입구 반복 탐색/ })[0],
    );
    await screen.findByRole("button", { name: "배송 완료했어요" });
    await user.click(screen.getByRole("tab", { name: "도움 받는 기사" }));
    await screen.findByText(
      "1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요",
    );

    await user.click(
      screen.getAllByRole("button", { name: "처음부터 다시" })[0],
    );

    await waitFor(() => expect(api.resetSimulation).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("tab", { name: "등록하는 기사" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("배송 마찰을 자동으로 찾고 있어요")).toBeVisible();
    expect(
      screen.getAllByText(
        "모든 제보·지식·검증·포인트를 지웠어요.",
      )[0],
    ).toBeVisible();
  });

  it("DB 초기화가 실패하면 화면만 초기화한 것처럼 처리하지 않는다", async () => {
    const api = createApi({
      resetSimulation: vi.fn(async () => {
        throw new ApiError(
          "데이터 초기화에 실패했습니다.",
          403,
          "SIMULATION_RESET_DISABLED",
        );
      }),
    });
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(
      screen.getAllByRole("button", { name: /출입구 반복 탐색/ })[0],
    );
    expect(
      await screen.findByRole("heading", {
        name: "출입구 반복 탐색이 감지됐어요",
      }),
    ).toBeVisible();

    await user.click(
      screen.getAllByRole("button", { name: "처음부터 다시" })[0],
    );

    expect(
      await screen.findByText("데이터 초기화에 실패했습니다."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "출입구 반복 탐색이 감지됐어요" }),
    ).toBeVisible();
  });
});
