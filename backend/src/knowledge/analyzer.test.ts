import { describe, expect, it } from "vitest";

import type { Claim } from "@/domain/contracts";

import { analyzeContribution } from "./analyzer";

const selectedAnswers = [
  {
    questionId: "friction_type",
    question: "오늘 이 배송에서 불편한 점이 있었나요?",
    choice: "출입구를 찾기 어려웠어요",
  },
];

describe("멀티모달 지식 분석", () => {
  it.each([
    [
      "정차할 곳을 찾기 어려웠어요",
      "UNLOADING_LOCATION",
      "배송지 인근 정차 위치를 찾는 데 시간이 걸릴 수 있음",
    ],
    [
      "하역 공간이 부족했어요",
      "UNLOADING_LOCATION",
      "배송지에서 하역 공간을 찾거나 이용하기 어려울 수 있음",
    ],
    [
      "출입구를 찾기 어려웠어요",
      "ENTRANCE_RECOMMENDATION",
      "배송지 출입구를 찾는 데 시간이 걸릴 수 있음",
    ],
    [
      "엘리베이터 이용이 어려웠어요",
      "ELEVATOR_GUIDE",
      "배송지에서 이용할 엘리베이터를 찾기 어려울 수 있음",
    ],
    [
      "건물 안에서 길을 찾기 어려웠어요",
      "INTERNAL_ROUTE",
      "건물 내부 이동 경로를 찾는 데 시간이 걸릴 수 있음",
    ],
    [
      "출입 절차를 알기 어려웠어요",
      "ACCESS_PROCEDURE",
      "배송지 출입 절차를 확인하는 데 시간이 걸릴 수 있음",
    ],
    [
      "배송지 시설 때문에 시간이 더 걸렸어요",
      "ACCESS_PROCEDURE",
      "배송지 시설 또는 운영 절차를 미리 확인할 필요가 있음",
    ],
  ] as const)(
    "모델 결과가 비면 '%s' 선택을 개인정보 없는 후보 지식으로 보완한다",
    async (choice: string, type: Claim["type"], value: string) => {
      const result = await analyzeContribution(
        {
          answers: [
            {
              questionId: "friction_type",
              question: "오늘 이 배송에서 불편한 점이 있었나요?",
              choice,
            },
          ],
        },
        async () => ({
          sanitizedSummary: "추출할 수 있는 지식이 없습니다.",
          removedPiiTypes: [],
          claims: [],
        }),
      );

      expect(result.claims).toEqual([
        {
          type,
          value,
          vehicleType: "ALL",
          timeCondition: null,
        },
      ]);
      expect(result.sanitizedSummary).toBe(value);
    },
  );

  it("후속 질문의 안내 항목을 첫 질문의 불편 유형보다 우선한다", async () => {
    const result = await analyzeContribution(
      {
        answers: [
          {
            questionId: "friction_type",
            question: "오늘 이 배송에서 불편한 점이 있었나요?",
            choice: "정차할 곳을 찾기 어려웠어요",
          },
          {
            questionId: "actionable_detail",
            question: "다음 기사에게 가장 먼저 알려주고 싶은 점은 무엇인가요?",
            choice: "추천 출입구",
          },
        ],
      },
      async () => ({
        sanitizedSummary: "추출할 수 있는 지식이 없습니다.",
        removedPiiTypes: [],
        claims: [],
      }),
    );

    expect(result.claims[0]).toMatchObject({
      type: "ENTRANCE_RECOMMENDATION",
      value: "배송지 출입구를 찾는 데 시간이 걸릴 수 있음",
    });
  });

  it("추가 설명 없이 선택형 답변만 분석하고 개인정보를 제거한다", async () => {
    let modelAnswers: unknown;
    await analyzeContribution(
      {
        answers: [
          {
            questionId: "friction_type",
            question: "010-1234-5678 어떤 불편이 있었나요?",
            choice: "출입구를 찾기 어려웠어요",
          },
        ],
      },
      async (input) => {
        modelAnswers = input.answers;
        return {
          sanitizedSummary: "후문 진입이 필요합니다.",
          removedPiiTypes: [],
          claims: [
            {
              type: "ENTRANCE_RECOMMENDATION",
              value: "후문 진입",
              vehicleType: "ALL",
              timeCondition: null,
            },
          ],
        };
      },
    );

    expect(modelAnswers).toEqual([
      {
        questionId: "friction_type",
        question: "[전화번호 제거] 어떤 불편이 있었나요?",
        choice: "출입구를 찾기 어려웠어요",
      },
    ]);
  });

  it("모델 입력 전에 텍스트 개인정보를 제거하고 모델 출력도 다시 제거한다", async () => {
    const result = await analyzeContribution(
      {
        answers: selectedAnswers,
        text: "010-1234-5678로 연락하면 되고 1톤차는 후문으로 가세요.",
      },
      async (input) => {
        if (input.sanitizedText.includes("010-1234-5678")) {
          throw new Error("원본 개인정보가 모델 입력에 남았습니다.");
        }
        return {
          sanitizedSummary: "010-1234-5678로 연락하고 1톤차는 후문으로 진입합니다.",
          removedPiiTypes: [],
          claims: [
            {
              type: "ENTRANCE_RECOMMENDATION",
              value: "010-1234-5678로 연락 후 후문 진입",
              vehicleType: "1TON",
              timeCondition: null,
            },
          ],
        };
      },
    );

    expect(JSON.stringify(result)).not.toContain("010-1234-5678");
    expect(result.removedPiiTypes).toContain("PHONE");
    expect(result.claims[0].value).toBe("[전화번호 제거]로 연락 후 후문 진입");
  });

  it("사진은 base64 모델 입력으로만 전달하고 분석 결과에는 원본을 포함하지 않는다", async () => {
    const photo = new Uint8Array([1, 2, 3, 4]);
    const result = await analyzeContribution(
      {
        answers: selectedAnswers,
        media: { mimeType: "image/jpeg", bytes: photo },
      },
      async (input) => {
        if (input.media?.dataBase64 !== "AQIDBA==") {
          throw new Error("사진이 모델용 base64로 전달되지 않았습니다.");
        }
        return {
          sanitizedSummary: "하역장은 지하 2층입니다.",
          removedPiiTypes: ["FACE", "EXIF"],
          claims: [
            {
              type: "UNLOADING_LOCATION",
              value: "지하 2층 하역장",
              vehicleType: "ALL",
              timeCondition: null,
            },
          ],
        };
      },
    );

    expect(result).not.toHaveProperty("media");
    expect(result.removedPiiTypes).toEqual(["FACE", "EXIF"]);
  });

  it("지원하지 않는 미디어 형식은 모델 호출 전에 거부한다", async () => {
    await expect(
      analyzeContribution(
        {
          answers: selectedAnswers,
          media: {
            mimeType: "application/pdf",
            bytes: new Uint8Array([1]),
          },
        },
        async () => {
          throw new Error("호출되면 안 됩니다.");
        },
      ),
    ).rejects.toThrow(/이미지와 음성/);
  });

  it("미디어 전처리에서 제거한 EXIF를 분석 결과에 합친다", async () => {
    const result = await analyzeContribution(
      {
        answers: selectedAnswers,
        media: {
          mimeType: "image/jpeg",
          bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
          removedPiiTypes: ["EXIF"],
        },
      },
      async () => ({
        sanitizedSummary: "후문을 이용합니다.",
        removedPiiTypes: [],
        claims: [
          {
            type: "ENTRANCE_RECOMMENDATION",
            value: "후문 이용",
            vehicleType: "ALL",
            timeCondition: null,
          },
        ],
      }),
    );

    expect(result.removedPiiTypes).toContain("EXIF");
  });
});
