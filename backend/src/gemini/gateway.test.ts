import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { describe, expect, it } from "vitest";

import { GeminiGateway, GeminiUnavailableError } from "./gateway";

function response(text: string): GenerateContentResponse {
  return { text } as GenerateContentResponse;
}

describe("Gemini 모델 게이트웨이", () => {
  it("집계된 이상 맥락으로 비난 없는 질문을 생성한다", async () => {
    const gateway = new GeminiGateway({
      model: "gemini-test",
      generateContent: async (request: GenerateContentParameters) => {
        const instruction = String(request.config?.systemInstruction);
        if (!instruction.includes("기사의 책임")) {
          throw new Error("질문 안전 지침이 없습니다.");
        }
        return response(
          JSON.stringify({
            shouldAsk: true,
            category: "PARKING",
            questions: [
              {
                id: "friction_type",
                question: "정차 장소를 찾을 때 불편한 점이 있었나요?",
                choices: [
                  "정차 공간이 부족했어요",
                  "하역 공간이 부족했어요",
                  "출입구가 멀었어요",
                  "불편하지 않았어요",
                ],
              },
            ],
          }),
        );
      },
    });

    const result = await gateway.generateQuestion({
      context: "PARKING",
      frictionTypes: ["REPEATED_STOPS"],
      reasons: ["정지와 이동이 반복됐습니다."],
    });

    expect(result.questions[0]?.question).toContain("불편한 점");
  });

  it("텍스트와 사진을 하나의 멀티모달 분석 요청으로 보낸다", async () => {
    const gateway = new GeminiGateway({
      model: "gemini-test",
      generateContent: async (request: GenerateContentParameters) => {
        const parts = (request.contents as { parts: Array<Record<string, unknown>> })
          .parts;
        if (!parts.some((part) => part.inlineData)) {
          throw new Error("멀티모달 미디어가 누락됐습니다.");
        }
        return response(
          JSON.stringify({
            sanitizedSummary: "지하 2층 하역장을 이용합니다.",
            removedPiiTypes: ["FACE", "EXIF"],
            claims: [
              {
                type: "UNLOADING_LOCATION",
                value: "지하 2층 하역장",
                vehicleType: "ALL",
                timeCondition: null,
              },
            ],
          }),
        );
      },
    });

    const result = await gateway.generateKnowledge({
      answerChoice: "사진으로 설명할게요",
      sanitizedText: "",
      media: { mimeType: "image/jpeg", dataBase64: "AQIDBA==" },
    });

    expect(result.claims[0].value).toBe("지하 2층 하역장");
  });

  it("기존 주장과 후보의 의미 관계를 구조화한다", async () => {
    const gateway = new GeminiGateway({
      model: "gemini-test",
      generateContent: async () =>
        response(
          JSON.stringify({
            relation: "SUPPORTS",
            targetClaimId: "claim-1",
          }),
        ),
    });

    const result = await gateway.matchClaim(
      {
        type: "ENTRANCE_RECOMMENDATION",
        value: "후문 진입",
        vehicleType: "1TON",
        timeCondition: null,
      },
      [
        {
          id: "claim-1",
          reportId: "report-1",
          placeId: "place-1",
          reporterId: "driver-a",
          type: "ENTRANCE_RECOMMENDATION",
          value: "화물차는 후문 이용",
          vehicleType: "1TON",
          timeCondition: null,
          status: "CANDIDATE",
          confidence: 0.35,
          helpfulCount: 0,
          createdAt: "2026-08-13T00:00:00.000Z",
        },
      ],
    );

    expect(result).toEqual({ relation: "SUPPORTS", targetClaimId: "claim-1" });
  });

  it("일시적인 모델 오류를 한 번 재시도한다", async () => {
    let attempts = 0;
    const gateway = new GeminiGateway({
      model: "gemini-test",
      maxAttempts: 2,
      generateContent: async () => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("rate limited"), { status: 429 });
        return response(
          JSON.stringify({
            shouldAsk: true,
            category: "PARKING",
            questions: [
              {
                id: "friction_type",
                question: "정차할 때 불편한 점이 있었나요?",
                choices: [
                  "정차 공간이 부족했어요",
                  "하역 공간이 부족했어요",
                  "출입구가 멀었어요",
                  "불편하지 않았어요",
                ],
              },
            ],
          }),
        );
      },
    });

    await gateway.generateQuestion({
      context: "PARKING",
      frictionTypes: ["REPEATED_STOPS"],
      reasons: [],
    });
    expect(attempts).toBe(2);
  });

  it("모델 호출 제한 시간을 넘으면 의존성 오류로 종료한다", async () => {
    const gateway = new GeminiGateway({
      model: "gemini-test",
      timeoutMs: 10,
      maxAttempts: 1,
      generateContent: async () => new Promise(() => undefined),
    });

    await expect(
      gateway.generateKnowledge({ sanitizedText: "후문으로 진입합니다." }),
    ).rejects.toBeInstanceOf(GeminiUnavailableError);
  });

  it("주장 매칭 모델이 실패하면 동일 문구를 결정론적으로 연결한다", async () => {
    const gateway = new GeminiGateway({
      model: "gemini-test",
      maxAttempts: 1,
      generateContent: async () => {
        throw Object.assign(new Error("service unavailable"), { status: 503 });
      },
    });
    const existing = {
      id: "claim-1",
      reportId: "report-1",
      placeId: "place-1",
      reporterId: "driver-a",
      type: "ENTRANCE_RECOMMENDATION" as const,
      value: "후문 진입",
      vehicleType: "1TON" as const,
      timeCondition: null,
      status: "CANDIDATE" as const,
      confidence: 0.35,
      helpfulCount: 0,
      createdAt: "2026-08-13T00:00:00.000Z",
    };

    await expect(
      gateway.matchClaim(
        {
          type: existing.type,
          value: " 후문   진입 ",
          vehicleType: existing.vehicleType,
          timeCondition: null,
        },
        [existing],
      ),
    ).resolves.toEqual({ relation: "SUPPORTS", targetClaimId: "claim-1" });
  });
});
