import type { FrictionFeatures, GpsSample } from "../types";

const MAX_ACCURACY_METERS = 50;
const JITTER_THRESHOLD_METERS = 5;
const MOVEMENT_THRESHOLD_METERS = 12;

export function summarizeGps(samples: GpsSample[]): FrictionFeatures {
  const accepted = deduplicateByTimestamp(samples)
    .filter((sample) => sample.accuracyMeters <= MAX_ACCURACY_METERS)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const distances = accepted.slice(1).map((sample, index) => {
    const distance = haversineMeters(accepted[index], sample);
    return distance < JITTER_THRESHOLD_METERS ? 0 : distance;
  });
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

function deduplicateByTimestamp(samples: GpsSample[]): GpsSample[] {
  const byTimestamp = new Map<number, GpsSample>();
  for (const sample of samples) {
    const existing = byTimestamp.get(sample.timestampMs);
    if (!existing || sample.accuracyMeters < existing.accuracyMeters) {
      byTimestamp.set(sample.timestampMs, sample);
    }
  }
  return [...byTimestamp.values()];
}

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
