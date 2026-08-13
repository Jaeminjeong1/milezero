import type {
  FrictionDecision,
  FrictionFeatures,
  GpsSample,
} from "./types";

const MAX_ACCURACY_METERS = 50;
const MOVEMENT_THRESHOLD_METERS = 12;
const MIN_SAMPLE_COUNT = 4;

function haversineMeters(a: GpsSample, b: GpsSample): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const h =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

export function summarizeGps(samples: GpsSample[]): FrictionFeatures {
  const accepted = [...samples]
    .filter((sample) => sample.accuracyMeters <= MAX_ACCURACY_METERS)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const distances = accepted
    .slice(1)
    .map((sample, index) => haversineMeters(accepted[index], sample));
  const movementStates = distances.map(
    (distance) => distance >= MOVEMENT_THRESHOLD_METERS,
  );
  const stopCount = movementStates.reduce(
    (count, moved, index) =>
      count + (!moved && index > 0 && movementStates[index - 1] ? 1 : 0),
    0,
  );
  const first = accepted.at(0);
  const last = accepted.at(-1);

  return {
    dwellSeconds:
      first && last
        ? Math.max(0, (last.timestampMs - first.timestampMs) / 1_000)
        : 0,
    stopCount,
    travelMeters: distances.reduce((total, distance) => total + distance, 0),
    displacementMeters:
      first && last ? haversineMeters(first, last) : 0,
    acceptedSampleCount: accepted.length,
  };
}

export function detectFriction(
  features: FrictionFeatures,
): FrictionDecision {
  if (features.acceptedSampleCount < MIN_SAMPLE_COUNT) {
    return {
      detected: false,
      frictionTypes: [],
      questionContext: "OTHER",
      reasons: ["신뢰할 수 있는 GPS 표본이 부족합니다."],
    };
  }

  const frictionTypes: FrictionDecision["frictionTypes"] = [];
  const reasons: string[] = [];

  if (features.dwellSeconds >= 360 && features.displacementMeters <= 120) {
    frictionTypes.push("LONG_DWELL");
    reasons.push("배송지 인근 체류가 6분 이상입니다.");
  }
  if (features.stopCount >= 3 && features.dwellSeconds >= 180) {
    frictionTypes.push("REPEATED_STOPS");
    reasons.push("정지와 이동이 세 차례 이상 반복됐습니다.");
  }
  if (
    features.travelMeters >= 140 &&
    features.displacementMeters <= 60 &&
    features.displacementMeters / Math.max(features.travelMeters, 1) <= 0.4
  ) {
    frictionTypes.push("REPEATED_MOVEMENT");
    reasons.push("좁은 범위 안에서 왕복 이동이 반복됐습니다.");
  }

  const detected = frictionTypes.length > 0;
  return {
    detected,
    frictionTypes,
    questionContext:
      frictionTypes.includes("REPEATED_STOPS")
        ? "PARKING"
        : frictionTypes.includes("REPEATED_MOVEMENT") || detected
          ? "ACCESS"
          : "OTHER",
    reasons,
  };
}
