// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient, fileToMedia } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MileZero API client", () => {
  it("질문 요청에는 원본 좌표가 아닌 GPS 집계 특징만 전송한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        shouldAsk: true,
        category: "PARKING",
        questions: [
          {
            id: "friction_type",
            question: "오늘 이 배송에서 불편한 점이 있었나요?",
            choices: [
              "정차 위치",
              "출입구 위치",
              "내부 이동",
              "불편하지 않았어요",
            ],
          },
        ],
      }),
    );
    const api = createApiClient({ fetchImpl });

    await api.createQuestion({
      dwellSeconds: 420,
      stopCount: 3,
      travelMeters: 90,
      displacementMeters: 20,
      acceptedSampleCount: 8,
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      features: {
        dwellSeconds: 420,
        stopCount: 3,
        travelMeters: 90,
        displacementMeters: 20,
        acceptedSampleCount: 8,
      },
    });
    expect(String(init?.body)).not.toMatch(/latitude|longitude/);
  });

  it("GPS 평가 요청에도 원본 좌표 없이 집계 특징만 전송한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        detected: true,
        frictionTypes: ["REPEATED_STOPS"],
        questionContext: "PARKING",
        reasons: ["정지와 이동이 세 차례 이상 반복됐습니다."],
      }),
    );
    const api = createApiClient({ fetchImpl });
    const features = {
      dwellSeconds: 420,
      stopCount: 3,
      travelMeters: 90,
      displacementMeters: 20,
      acceptedSampleCount: 8,
    };

    await api.evaluateFriction(features);

    const [path, init] = fetchImpl.mock.calls[0];
    expect(path).toBe("/v1/friction/evaluate");
    expect(JSON.parse(String(init?.body))).toEqual({ features });
    expect(String(init?.body)).not.toMatch(/latitude|longitude/);
  });

  it("제보에 가명 기사 ID와 멱등 키를 포함한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        reportId: "report-1",
        claimIds: ["claim-1"],
        claimStatuses: ["CANDIDATE"],
        awardedPoints: 10,
      }, 201),
    );
    const api = createApiClient({ fetchImpl });

    await api.submitReport({
      driverId: "demo-driver-a",
      idempotencyKey: "demo-report-001",
      placeId: "demo-place",
      vehicleType: "1TON",
      contribution: {
        answers: [
          {
            questionId: "friction_type",
            question: "오늘 이 배송에서 불편한 점이 있었나요?",
            choice: "출입구를 찾기 어려웠어요",
          },
        ],
        text: "후문을 이용하세요.",
      },
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(new Headers(init?.headers).get("x-driver-id")).toBe("demo-driver-a");
    expect(JSON.parse(String(init?.body)).idempotencyKey).toBe(
      "demo-report-001",
    );
    expect(JSON.parse(String(init?.body)).contribution.answers).toHaveLength(1);
    expect(String(init?.body)).not.toMatch(/latitude|longitude/);
  });

  it("미디어 파일을 Data URL 접두사 없는 base64로 변환한다", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "gate.jpg", {
      type: "image/jpeg",
    });

    await expect(fileToMedia(file)).resolves.toEqual({
      mimeType: "image/jpeg",
      dataBase64: "/9j/2Q==",
    });
  });

  it("비정상 HTTP 응답을 사용자 메시지가 있는 ApiError로 변환한다", async () => {
    const api = createApiClient({
      fetchImpl: async () =>
        jsonResponse({ code: "INVALID_MEDIA", error: "파일이 손상됐습니다." }, 400),
    });

    await expect(
      api.getKnowledge({
        driverId: "demo-driver-b",
        placeId: "demo-place",
        vehicleType: "1TON",
      }),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        status: 400,
        code: "INVALID_MEDIA",
        message: "파일이 손상됐습니다.",
      }),
    );
  });
});
