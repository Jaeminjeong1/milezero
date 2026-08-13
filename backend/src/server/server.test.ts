import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BackendPipeline } from "@/pipeline/pipeline";
import { InMemoryKnowledgeStore } from "@/storage/in-memory-store";
import { GeminiUnavailableError } from "@/gemini/gateway";

import { buildServer } from "./server";

const selectedAnswers = [
  {
    questionId: "friction_type",
    question: "오늘 이 배송에서 불편한 점이 있었나요?",
    choice: "출입구를 찾기 어려웠어요",
  },
];

function createTestServer() {
  const store = new InMemoryKnowledgeStore();
  const pipeline = new BackendPipeline({
    store,
    generateQuestion: async () => ({
      shouldAsk: true,
      category: "PARKING",
      questions: [
        {
          id: "friction_type",
          question: "정차하거나 하역할 때 불편한 점이 있었나요?",
          choices: [
            "정차 위치를 찾기 어려웠어요",
            "하역 공간이 부족했어요",
            "출입구가 멀었어요",
            "불편하지 않았어요",
          ],
        },
      ],
    }),
    generateKnowledge: async () => ({
      sanitizedSummary: "1톤 차량은 후문으로 진입합니다.",
      removedPiiTypes: [],
      claims: [
        {
          type: "ENTRANCE_RECOMMENDATION",
          value: "1톤 차량은 후문으로 진입",
          vehicleType: "1TON",
          timeCondition: null,
        },
      ],
    }),
    matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
  });
  return { store, server: buildServer(pipeline) };
}

const servers: Array<ReturnType<typeof buildServer>> = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("백엔드 HTTP API", () => {
  it("1~2개의 선택형 답변만으로 제보를 접수한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const response = await server.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { "x-driver-id": "driver-a" },
      payload: {
        idempotencyKey: "answers-only-report",
        placeId: "place-1",
        vehicleType: "1TON",
        contribution: {
          answers: [
            {
              questionId: "friction_type",
              question: "오늘 이 배송에서 불편한 점이 있었나요?",
              choice: "출입구를 찾기 어려웠어요",
            },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().awardedPoints).toBe(10);
  });

  it.each([
    { name: "답변 없음", answers: [] },
    {
      name: "답변 3개",
      answers: Array.from({ length: 3 }, (_, index) => ({
        questionId: `question-${index}`,
        question: "어떤 불편이 있었나요?",
        choice: "출입구를 찾기 어려웠어요",
      })),
    },
    {
      name: "빈 질문 ID",
      answers: [
        {
          questionId: " ",
          question: "어떤 불편이 있었나요?",
          choice: "출입구를 찾기 어려웠어요",
        },
      ],
    },
    {
      name: "너무 긴 답변",
      answers: [
        {
          questionId: "friction_type",
          question: "어떤 불편이 있었나요?",
          choice: "가".repeat(121),
        },
      ],
    },
  ])(
    "잘못된 선택형 답변을 거부한다: $name",
    async ({ answers }: { answers: Array<Record<string, string>> }) => {
      const { server } = createTestServer();
      servers.push(server);
      const response = await server.inject({
        method: "POST",
        url: "/v1/reports",
        headers: { "x-driver-id": "driver-a" },
        payload: {
          idempotencyKey: "invalid-answers-report",
          placeId: "place-1",
          vehicleType: "1TON",
          contribution: { answers },
        },
      });

      expect(response.statusCode).toBe(400);
    },
  );

  it("원본 GPS가 아닌 집계 특징으로 질문을 생성한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const response = await server.inject({
      method: "POST",
      url: "/v1/questions",
      payload: {
        features: {
          dwellSeconds: 420,
          stopCount: 3,
          travelMeters: 90,
          displacementMeters: 20,
          acceptedSampleCount: 8,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().questions[0].question).toContain("불편한 점");
  });

  it("위도·경도가 포함된 원본 GPS 요청을 거부한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const response = await server.inject({
      method: "POST",
      url: "/v1/questions",
      payload: {
        features: {
          dwellSeconds: 420,
          stopCount: 3,
          travelMeters: 90,
          displacementMeters: 20,
          acceptedSampleCount: 8,
          latitude: 37.4979,
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("집계된 GPS 특징을 질문 생성 없이 결정론적으로 평가한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const response = await server.inject({
      method: "POST",
      url: "/v1/friction/evaluate",
      payload: {
        features: {
          dwellSeconds: 300,
          stopCount: 1,
          travelMeters: 180,
          displacementMeters: 25,
          acceptedSampleCount: 8,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      detected: true,
      frictionTypes: ["REPEATED_MOVEMENT"],
      questionContext: "ACCESS",
    });
  });

  it("심사 모드에서는 시뮬레이션 초기화 함수를 실행한다", async () => {
    const store = new InMemoryKnowledgeStore();
    let resetCount = 0;
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => ({
        sanitizedSummary: "",
        removedPiiTypes: [],
        claims: [],
      }),
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const server = buildServer(pipeline, {
      resetSimulation: async () => {
        resetCount += 1;
      },
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/v1/simulation/reset",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reset: true });
    expect(resetCount).toBe(1);
  });

  it("초기화 핸들러가 없는 서버는 데이터 변경 요청을 거부한다", async () => {
    const { server } = createTestServer();
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/v1/simulation/reset",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "SIMULATION_RESET_DISABLED",
      error: "운영 데이터는 초기화할 수 없습니다.",
    });
  });

  it("직선 변위가 누적 이동보다 큰 모순된 GPS 집계를 거부한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const response = await server.inject({
      method: "POST",
      url: "/v1/friction/evaluate",
      payload: {
        features: {
          dwellSeconds: 300,
          stopCount: 1,
          travelMeters: 100,
          displacementMeters: 200,
          acceptedSampleCount: 8,
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("도움 없음 피드백을 유용성 신호로 접수한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const report = await server.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { "x-driver-id": "driver-a" },
      payload: {
        idempotencyKey: "not-helpful-report",
        placeId: "place-1",
        vehicleType: "1TON",
        contribution: { answers: selectedAnswers },
      },
    });

    const feedback = await server.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: { "x-driver-id": "driver-b" },
      payload: {
        claimId: report.json().claimIds[0],
        feedback: "NOT_HELPFUL",
      },
    });

    expect(feedback.statusCode).toBe(200);
    expect(feedback.json()).toEqual(
      expect.objectContaining({
        status: "CANDIDATE",
        notHelpfulCount: 1,
        utilityScore: 0.35,
      }),
    );
  });

  it("제보부터 독립 확인과 다음 기사 가이드까지 연결한다", async () => {
    const { server, store } = createTestServer();
    servers.push(server);
    const reportResponse = await server.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { "x-driver-id": "driver-a" },
      payload: {
        idempotencyKey: "server-report-1",
        placeId: "place-1",
        vehicleType: "1TON",
        contribution: {
          answers: selectedAnswers,
          text: "010-1234-5678로 연락하고 1톤 차량은 후문으로 진입하세요.",
        },
      },
    });
    expect(reportResponse.statusCode).toBe(201);
    expect(JSON.stringify(store.snapshot())).not.toContain("010-1234-5678");
    const claimId = reportResponse.json().claimIds[0];

    const pendingResponse = await server.inject({
      method: "GET",
      url: "/v1/knowledge?placeId=place-1&vehicleType=1TON",
      headers: { "x-driver-id": "driver-b" },
    });
    expect(pendingResponse.json().items).toEqual([]);
    expect(pendingResponse.json().pendingConfirmation.claimId).toBe(claimId);

    const feedbackResponse = await server.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: { "x-driver-id": "driver-b" },
      payload: { claimId, feedback: "CONFIRM" },
    });
    expect(feedbackResponse.json().status).toBe("VERIFIED");

    const guideResponse = await server.inject({
      method: "GET",
      url: "/v1/knowledge?placeId=place-1&vehicleType=1TON",
      headers: { "x-driver-id": "driver-c" },
    });
    expect(guideResponse.json().items[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("후문"),
        type: "ENTRANCE_RECOMMENDATION",
        vehicleType: "1TON",
        timeCondition: null,
        reportedAt: expect.any(String),
      }),
    );

    const ownGuideResponse = await server.inject({
      method: "GET",
      url: "/v1/knowledge?placeId=place-1&vehicleType=1TON",
      headers: { "x-driver-id": "driver-a" },
    });
    expect(ownGuideResponse.json().items).toEqual([]);
  });

  it("기사 식별자가 없는 제보 요청을 거부한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const response = await server.inject({
      method: "POST",
      url: "/v1/reports",
      payload: {
        idempotencyKey: "server-report-unauthorized",
        placeId: "place-1",
        vehicleType: "1TON",
        contribution: { answers: selectedAnswers, text: "후문으로 진입합니다." },
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("Gemini 분석 장애를 503으로 구분한다", async () => {
    const store = new InMemoryKnowledgeStore();
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => {
        throw new GeminiUnavailableError("Gemini unavailable");
      },
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const server = buildServer(pipeline);
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { "x-driver-id": "driver-a" },
      payload: {
        idempotencyKey: "server-gemini-error",
        placeId: "place-1",
        vehicleType: "1TON",
        contribution: { answers: selectedAnswers, text: "후문으로 진입합니다." },
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "DEPENDENCY_UNAVAILABLE",
      error: "AI 분석 서비스를 잠시 사용할 수 없습니다.",
    });
  });

  it("저장할 지식이 없는 응답은 422로 구분한다", async () => {
    const store = new InMemoryKnowledgeStore();
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => ({
        sanitizedSummary: "불편하지 않았습니다.",
        removedPiiTypes: [],
        claims: [],
      }),
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const server = buildServer(pipeline);
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { "x-driver-id": "driver-a" },
      payload: {
        idempotencyKey: "server-no-knowledge",
        placeId: "place-1",
        vehicleType: "1TON",
        contribution: {
          answers: [
            {
              ...selectedAnswers[0],
              choice: "불편하지 않았어요",
            },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(422);
  });

  it("깨진 base64 미디어는 Gemini 호출 전에 400으로 거부한다", async () => {
    const { server } = createTestServer();
    servers.push(server);
    const response = await server.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { "x-driver-id": "driver-a" },
      payload: {
        idempotencyKey: "server-invalid-media",
        placeId: "place-1",
        vehicleType: "1TON",
        contribution: {
          answers: selectedAnswers,
          media: { mimeType: "image/jpeg", dataBase64: "not@base64" },
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("의존 저장소가 준비되면 readiness를 200으로 응답한다", async () => {
    const store = new InMemoryKnowledgeStore();
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => null,
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const server = buildServer(pipeline, {
      readiness: async () => store.getPointBalance("readiness-probe"),
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("의존 저장소 점검 실패 시 readiness를 503으로 응답한다", async () => {
    const pipeline = new BackendPipeline({
      store: new InMemoryKnowledgeStore(),
      generateQuestion: async () => null,
      generateKnowledge: async () => null,
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const server = buildServer(pipeline, {
      readiness: async () => {
        throw new Error("database unavailable");
      },
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready" });
  });

  it("설정된 프런트엔드 origin에만 CORS 응답 헤더를 제공한다", async () => {
    const store = new InMemoryKnowledgeStore();
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => null,
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const server = buildServer(pipeline, {
      corsOrigins: ["https://judge.milezero.example"],
    });
    servers.push(server);

    const allowed = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://judge.milezero.example" },
    });
    const denied = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://attacker.example" },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://judge.milezero.example",
    );
    expect(denied.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("같은 서버에서 클라이언트 홈과 정적 자산을 제공한다", async () => {
    const directory = await mkdtemp(join(tmpdir(), "milezero-client-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "index.html"), "<main>MileZero Web App</main>");
    await writeFile(join(directory, "app.js"), "console.log('milezero')");
    const store = new InMemoryKnowledgeStore();
    const pipeline = new BackendPipeline({
      store,
      generateQuestion: async () => null,
      generateKnowledge: async () => null,
      matchClaim: async () => ({ relation: "NEW", targetClaimId: null }),
    });
    const server = buildServer(pipeline, { clientDistPath: directory });
    servers.push(server);

    const home = await server.inject({ method: "GET", url: "/" });
    const asset = await server.inject({ method: "GET", url: "/app.js" });
    const missingApi = await server.inject({ method: "GET", url: "/v1/missing" });

    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("MileZero Web App");
    expect(asset.body).toContain("milezero");
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.headers["content-type"]).toContain("application/json");
  });
});
