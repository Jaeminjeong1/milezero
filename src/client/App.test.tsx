// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
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
});
