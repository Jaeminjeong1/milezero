// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MileZeroApi } from "./types";
import { App } from "./App";

function createApi(): MileZeroApi {
  return {
    createQuestion: vi.fn(async () => null),
    submitReport: vi.fn(),
    getKnowledge: vi.fn(async () => ({
      items: [],
      pendingConfirmation: null,
    })),
    recordFeedback: vi.fn(),
  };
}

describe("MileZero 홈", () => {
  it("로그인 없이 현재 배송과 개인정보 원칙을 바로 보여준다", () => {
    render(<App api={createApi()} autoDetectDelayMs={60_000} />);

    expect(screen.getByRole("heading", { name: "MileZero" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "오늘 배송" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "다음 배송" })).toBeVisible();
    expect(screen.getByText("합성 데이터 데모")).toBeVisible();
    expect(screen.getByText("센트럴시티 타워")).toBeVisible();
    expect(screen.getByText("1톤 · 배송지 100m 이내")).toBeVisible();
    expect(screen.getByText("GPS 원본은 저장하지 않아요")).toBeVisible();
    expect(screen.getByRole("button", { name: "데모 다시 보기" })).toBeVisible();
  });

  it("자동 질문에서 불편을 선택하고 제보해 10포인트를 받는다", async () => {
    let resolveReport!: (value: Awaited<ReturnType<MileZeroApi["submitReport"]>>) => void;
    const submitReport = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<MileZeroApi["submitReport"]>>>((resolve) => {
          resolveReport = resolve;
        }),
    );
    const api = createApi();
    api.createQuestion = vi.fn<MileZeroApi["createQuestion"]>(async () => ({
      shouldAsk: true,
      category: "ENTRANCE",
      question: "오늘 이 배송에서 불편한 점이 있었나요?",
      choices: ["출입구를 찾기 어려웠어요", "불편하지 않았어요"],
    }));
    api.submitReport = submitReport;
    const user = userEvent.setup();

    render(<App api={api} autoDetectDelayMs={0} />);
    expect(
      await screen.findByRole("heading", {
        name: "오늘 이 배송에서 불편한 점이 있었나요?",
      }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "출입구를 찾기 어려웠어요" }));
    await user.type(
      screen.getByLabelText("다음 기사에게 알려줄 내용"),
      "정문은 복잡해서 후문으로 들어가야 해요.",
    );
    await user.click(screen.getByRole("button", { name: "경험 보내고 10P 받기" }));

    expect(screen.getByText("개인정보 제거")).toBeVisible();
    resolveReport({
      reportId: "report-1",
      claimIds: ["claim-1"],
      claimStatuses: ["CANDIDATE"],
      awardedPoints: 10,
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "10P가 바로 쌓였어요" })).toBeVisible(),
    );
    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        contribution: expect.objectContaining({
          text: "정문은 복잡해서 후문으로 들어가야 해요.",
        }),
      }),
    );
  });
});
