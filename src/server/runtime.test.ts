import { describe, expect, it } from "vitest";

import {
  parseCorsOrigins,
  parseRuntimeConfig,
  resolveClientDistPath,
} from "./runtime";

describe("백엔드 실행 설정", () => {
  it("Railway PORT와 호스트를 읽는다", () => {
    expect(parseRuntimeConfig({ PORT: "8080" })).toEqual({
      host: "0.0.0.0",
      port: 8080,
    });
  });

  it("잘못된 포트는 시작 전에 거부한다", () => {
    expect(() => parseRuntimeConfig({ PORT: "not-a-port" })).toThrow(/PORT/);
  });

  it("쉼표로 구분한 프런트엔드 origin allowlist를 읽는다", () => {
    expect(
      parseCorsOrigins({
        CORS_ORIGINS: "https://milezero.example, http://localhost:5173 ",
      }),
    ).toEqual(["https://milezero.example", "http://localhost:5173"]);
  });

  it("와일드카드나 경로가 있는 CORS 설정은 시작 전에 거부한다", () => {
    expect(() => parseCorsOrigins({ CORS_ORIGINS: "*" })).toThrow(/CORS/);
    expect(() =>
      parseCorsOrigins({ CORS_ORIGINS: "https://milezero.example/path" }),
    ).toThrow(/CORS/);
  });

  it("클라이언트 빌드가 있을 때만 Fastify 정적 경로를 활성화한다", () => {
    expect(resolveClientDistPath("/app", () => true)).toBe("/app/dist/client");
    expect(resolveClientDistPath("/app", () => false)).toBeUndefined();
  });
});
