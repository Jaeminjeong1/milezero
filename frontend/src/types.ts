export type VehicleType = "ALL" | "BIKE" | "CAR" | "VAN" | "1TON";

export type FrictionFeatures = {
  dwellSeconds: number;
  stopCount: number;
  travelMeters: number;
  displacementMeters: number;
  acceptedSampleCount: number;
};

export type QuestionPlan = {
  shouldAsk: boolean;
  category:
    | "PARKING"
    | "ENTRANCE"
    | "ACCESS"
    | "ELEVATOR"
    | "INTERNAL_ROUTE"
    | "OTHER";
  question: string;
  choices: string[];
};

export type MediaInput = { mimeType: string; dataBase64: string };

export type ReportReceipt = {
  reportId: string;
  claimIds: string[];
  claimStatuses: Array<"CANDIDATE" | "VERIFIED" | "CONFLICT">;
  awardedPoints: 10;
};

export type DeliveryKnowledge = {
  items: Array<{ claimId: string; text: string; confidence: number }>;
  pendingConfirmation: { claimId: string; text: string } | null;
};

export type FeedbackType = "CONFIRM" | "CONTRADICT" | "HELPFUL";

export type FeedbackResult = {
  accepted: boolean;
  status: "CANDIDATE" | "VERIFIED" | "CONFLICT";
  confidence: number;
  helpfulCount: number;
};

export type ReportInput = {
  driverId: string;
  idempotencyKey: string;
  placeId: string;
  vehicleType: VehicleType;
  contribution: {
    answerChoice?: string;
    text?: string;
    media?: MediaInput;
  };
};

export type MileZeroApi = {
  createQuestion(features: FrictionFeatures): Promise<QuestionPlan | null>;
  submitReport(input: ReportInput): Promise<ReportReceipt>;
  getKnowledge(input: {
    driverId: string;
    placeId: string;
    vehicleType: VehicleType;
  }): Promise<DeliveryKnowledge>;
  recordFeedback(input: {
    driverId: string;
    claimId: string;
    feedback: FeedbackType;
  }): Promise<FeedbackResult>;
};
