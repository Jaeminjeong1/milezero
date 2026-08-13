import { describe, expect, it } from "vitest";

import type { GpsSample } from "../types";
import { summarizeGps } from "./aggregator";

describe("브라우저 GPS 집계", () => {
  it("정확도가 낮은 표본과 중복 시각을 제거하고 jitter를 이동에서 제외한다", () => {
    const samples: GpsSample[] = [
      sample(37.4979, 127.0276, 0, 8),
      sample(37.6, 127.2, 0, 20),
      sample(37.49791, 127.0276, 60_000, 8),
      sample(37.4979, 127.02761, 120_000, 8),
      sample(37.49791, 127.02761, 180_000, 8),
      sample(37.6, 127.2, 240_000, 100),
    ];

    const result = summarizeGps(samples);

    expect(result.acceptedSampleCount).toBe(4);
    expect(result.travelMeters).toBe(0);
    expect(result.stopCount).toBe(0);
  });

  it("입력 순서와 무관하게 첫 표본부터 마지막 표본까지 체류 시간을 계산한다", () => {
    const result = summarizeGps([
      sample(37.4979, 127.0276, 180_000),
      sample(37.4979, 127.0276, 0),
      sample(37.4979, 127.0276, 60_000),
      sample(37.4979, 127.0276, 120_000),
    ]);

    expect(result.dwellSeconds).toBe(180);
  });
});

function sample(
  latitude: number,
  longitude: number,
  timestampMs: number,
  accuracyMeters = 8,
): GpsSample {
  return { latitude, longitude, timestampMs, accuracyMeters };
}
