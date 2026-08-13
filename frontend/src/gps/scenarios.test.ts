import { describe, expect, it } from "vitest";

import { summarizeGps } from "./aggregator";
import { GPS_SCENARIOS } from "./scenarios";

describe("GPS 이상 탐지 시나리오", () => {
  it("주변 서성임은 이동 뒤 정지를 세 번 만든다", () => {
    expect(
      summarizeGps(GPS_SCENARIOS.WANDERING.samples),
    ).toMatchObject({ stopCount: 3, dwellSeconds: 420 });
  });

  it("정차 후 완료 지연은 7분 이상 체류한다", () => {
    expect(
      summarizeGps(GPS_SCENARIOS.LONG_STOP.samples).dwellSeconds,
    ).toBeGreaterThanOrEqual(420);
  });

  it("출입구 반복 탐색은 좁은 범위에서 140m 이상 왕복한다", () => {
    const features = summarizeGps(GPS_SCENARIOS.ACCESS_RETRY.samples);

    expect(features.travelMeters).toBeGreaterThanOrEqual(140);
    expect(features.displacementMeters).toBeLessThanOrEqual(60);
  });
});
