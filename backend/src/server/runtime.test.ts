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

  it("소스 모듈 위치를 기준으로 frontend 빌드를 찾는다", () => {
    expect(
      resolveClientDistPath({
        moduleUrl: "file:///app/backend/src/server/runtime.ts",
        exists: (path) => path === "/app/frontend/dist",
      }),
    ).toBe("/app/frontend/dist");
    expect(
      resolveClientDistPath({
        moduleUrl: "file:///app/backend/src/server/runtime.ts",
        exists: () => false,
      }),
    ).toBeUndefined();
  });

  it("번들 모듈 위치를 기준으로 frontend 빌드를 찾는다", () => {
    expect(
      resolveClientDistPath({
        moduleUrl: "file:///app/backend/dist/main.js",
        exists: (path) => path === "/app/frontend/dist",
      }),
    ).toBe("/app/frontend/dist");
  });

  it("CLIENT_DIST_DIR로 지정한 절대 경로를 우선한다", () => {
    expect(
      resolveClientDistPath({
        moduleUrl: "file:///app/backend/dist/main.js",
        configuredPath: "/srv/milezero/client",
        exists: (path) => path === "/srv/milezero/client",
      }),
    ).toBe("/srv/milezero/client");
  });
});
