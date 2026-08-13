import { describe, expect, it } from "vitest";

import { detectFriction, summarizeGps } from "./detector";
import type { GpsSample } from "./types";

const parkingSearch: GpsSample[] = [
  { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 0 },
  { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 60_000 },
  { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 120_000 },
  { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 180_000 },
  { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 240_000 },
  { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 300_000 },
  { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 360_000 },
  { latitude: 37.4981, longitude: 127.0276, accuracyMeters: 8, timestampMs: 420_000 },
];

describe("GPS 마찰 탐지", () => {
  it("배송지 인근 정지와 이동 반복을 정차 탐색으로 감지한다", () => {
    const features = summarizeGps(parkingSearch);
    const result = detectFriction(features);

    expect(features.stopCount).toBe(3);
    expect(result.detected).toBe(true);
    expect(result.frictionTypes).toContain("REPEATED_STOPS");
    expect(result.questionContext).toBe("PARKING");
  });

  it("정확도 50m를 넘는 표본은 집계에서 제외한다", () => {
    const features = summarizeGps([
      ...parkingSearch,
      {
        latitude: 37.6,
        longitude: 127.2,
        accuracyMeters: 100,
        timestampMs: 480_000,
      },
    ]);

    expect(features.acceptedSampleCount).toBe(parkingSearch.length);
  });

  it("단순 도착은 질문 대상으로 만들지 않는다", () => {
    const result = detectFriction(
      summarizeGps([
        { latitude: 37.4975, longitude: 127.0276, accuracyMeters: 8, timestampMs: 0 },
        { latitude: 37.4979, longitude: 127.0276, accuracyMeters: 8, timestampMs: 60_000 },
      ]),
    );

    expect(result.detected).toBe(false);
  });
});
