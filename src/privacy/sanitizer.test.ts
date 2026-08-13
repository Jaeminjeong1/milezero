import { describe, expect, it } from "vitest";

import { sanitizeText } from "./sanitizer";

describe("개인정보 제거", () => {
  it("전화번호·동호수·비밀번호·차량번호만 제거하고 현장 지식은 보존한다", () => {
    const result = sanitizeText(
      "010-1234-5678로 연락하고 101동 1203호, 공동현관 비밀번호 2580, 차량 12가 3456입니다. 1톤차는 후문으로 가세요.",
    );

    expect(result.text).not.toContain("010-1234-5678");
    expect(result.text).not.toContain("101동 1203호");
    expect(result.text).not.toContain("2580");
    expect(result.text).not.toContain("12가 3456");
    expect(result.text).toContain("1톤차는 후문으로 가세요.");
    expect(result.removedPiiTypes).toEqual([
      "PHONE",
      "UNIT",
      "PASSWORD",
      "PLATE",
    ]);
  });

  it("이메일을 제거한 뒤 재질문 상태를 만들지 않는다", () => {
    const result = sanitizeText("문의는 driver@example.com, 하역은 지하 2층입니다.");

    expect(result).toEqual({
      text: "문의는 [이메일 제거], 하역은 지하 2층입니다.",
      removedPiiTypes: ["EMAIL"],
    });
    expect(result).not.toHaveProperty("needsRetry");
  });
});
