import { describe, expect, it } from "vitest";

import { analyzeContribution } from "./analyzer";

describe("멀티모달 지식 분석", () => {
  it("모델 입력 전에 텍스트 개인정보를 제거하고 모델 출력도 다시 제거한다", async () => {
    const result = await analyzeContribution(
      {
        answerChoice: "정차 위치를 찾기 어려웠어요",
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
        answerChoice: "사진으로 설명할게요",
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
