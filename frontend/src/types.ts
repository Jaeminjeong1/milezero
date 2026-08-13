export type VehicleType = "ALL" | "BIKE" | "CAR" | "VAN" | "1TON";

export type FrictionFeatures = {
  dwellSeconds: number;
  stopCount: number;
  travelMeters: number;
  displacementMeters: number;
  acceptedSampleCount: number;
};

export type QuestionItem = {
  id: string;
  question: string;
  choices: string[];
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
  questions: QuestionItem[];
};

export type MediaInput = { mimeType: string; dataBase64: string };

export type ReportReceipt = {
  reportId: string;
  claimIds: string[];
  claimStatuses: Array<"CANDIDATE" | "VERIFIED" | "CONFLICT">;
  awardedPoints: 10;
};

export type KnowledgeClaimType =
  | "ENTRANCE_RECOMMENDATION"
  | "UNLOADING_LOCATION"
  | "VEHICLE_RESTRICTION"
  | "ACCESS_PROCEDURE"
  | "ELEVATOR_GUIDE"
  | "INTERNAL_ROUTE";

export type DeliveryKnowledgeItem = {
  claimId: string;
  text: string;
  type: KnowledgeClaimType;
  vehicleType: VehicleType;
  timeCondition: string | null;
  confidence: number;
  reportedAt: string;
};

export type DeliveryKnowledge = {
  items: DeliveryKnowledgeItem[];
  pendingConfirmation: { claimId: string; text: string } | null;
};

export type FeedbackType =
  | "CONFIRM"
  | "CONTRADICT"
  | "HELPFUL"
  | "NOT_HELPFUL";

export type FeedbackResult = {
  accepted: boolean;
  status: "CANDIDATE" | "VERIFIED" | "CONFLICT";
  confidence: number;
  helpfulCount: number;
  notHelpfulCount: number;
  utilityScore: number;
};

export type QuestionAnswer = {
  questionId: string;
  question: string;
  choice: string;
};

export type ReportInput = {
  driverId: string;
  idempotencyKey: string;
  placeId: string;
  vehicleType: VehicleType;
  contribution: {
    answers: QuestionAnswer[];
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
