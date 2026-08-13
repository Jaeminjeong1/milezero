export type GpsSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestampMs: number;
};

export type FrictionFeatures = {
  dwellSeconds: number;
  stopCount: number;
  travelMeters: number;
  displacementMeters: number;
  acceptedSampleCount: number;
};

export type FrictionType =
  | "LONG_DWELL"
  | "REPEATED_STOPS"
  | "REPEATED_MOVEMENT";

export type QuestionContext = "PARKING" | "ACCESS" | "OTHER";

export type FrictionDecision = {
  detected: boolean;
  frictionTypes: FrictionType[];
  questionContext: QuestionContext;
  reasons: string[];
};
