import { describe, expect, it } from "vitest";

import { prepareMedia } from "./validator";

describe("멀티모달 미디어 검증", () => {
  it("깨진 base64 입력을 거부한다", () => {
    expect(() =>
      prepareMedia({ mimeType: "image/jpeg", dataBase64: "not@base64" }),
    ).toThrow(/base64/);
  });

  it("선언한 MIME과 실제 파일 시그니처가 다르면 거부한다", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
    expect(() =>
      prepareMedia({ mimeType: "image/png", dataBase64: jpeg }),
    ).toThrow(/MIME/);
  });

  it("JPEG EXIF 구간을 Gemini 전달 전에 제거한다", () => {
    const jpegWithExif = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x0a,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02,
      0xff, 0xd9,
    ]);
    const result = prepareMedia({
      mimeType: "image/jpeg",
      dataBase64: jpegWithExif.toString("base64"),
    });

    expect(Buffer.from(result.bytes).includes(Buffer.from("Exif"))).toBe(false);
    expect(result.removedPiiTypes).toContain("EXIF");
    expect([...result.bytes]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
  });
});
