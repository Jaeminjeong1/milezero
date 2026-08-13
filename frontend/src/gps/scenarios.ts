import type { GpsSample } from "../types";

export type GpsScenarioId = "WANDERING" | "LONG_STOP" | "ACCESS_RETRY";

export type GpsScenario = {
  id: GpsScenarioId;
  label: string;
  description: string;
  samples: GpsSample[];
};

export const GPS_SCENARIOS: Record<GpsScenarioId, GpsScenario> = {
  WANDERING: {
    id: "WANDERING",
    label: "주변을 서성임",
    description: "배송지 주변에서 이동과 정지를 반복해요",
    samples: [
      sample(37.4979, 127.0276, 0),
      sample(37.4979, 127.0276, 60_000),
      sample(37.4981, 127.0276, 120_000),
      sample(37.4981, 127.0276, 180_000),
      sample(37.4979, 127.0276, 240_000),
      sample(37.4979, 127.0276, 300_000),
      sample(37.4981, 127.0276, 360_000),
      sample(37.4981, 127.0276, 420_000),
    ],
  },
  LONG_STOP: {
    id: "LONG_STOP",
    label: "정차 후 완료 지연",
    description: "정차한 뒤 배송 완료까지 오래 걸려요",
    samples: [0, 60_000, 120_000, 240_000, 360_000, 420_000].map(
      (timestampMs) => sample(37.4979, 127.0276, timestampMs),
    ),
  },
  ACCESS_RETRY: {
    id: "ACCESS_RETRY",
    label: "출입구 반복 탐색",
    description: "좁은 범위에서 출입구를 찾아 여러 번 왕복해요",
    samples: [
      sample(37.4979, 127.0276, 0),
      sample(37.49845, 127.0276, 60_000),
      sample(37.4979, 127.0276, 120_000),
      sample(37.49845, 127.0276, 180_000),
      sample(37.4979, 127.0276, 240_000),
      sample(37.4979, 127.0276, 300_000),
    ],
  },
};

export const GPS_SCENARIO_LIST = Object.values(GPS_SCENARIOS);

function sample(
  latitude: number,
  longitude: number,
  timestampMs: number,
): GpsSample {
  return { latitude, longitude, timestampMs, accuracyMeters: 8 };
}
