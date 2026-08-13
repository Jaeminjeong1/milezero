import type {
  DeliveryKnowledge,
  FeedbackResult,
  FrictionDecision,
  FrictionFeatures,
  MediaInput,
  MileZeroApi,
  QuestionPlan,
  ReportInput,
  ReportReceipt,
} from "./types";

type Fetch = typeof fetch;

export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function createApiClient(options: {
  baseUrl?: string;
  fetchImpl?: Fetch;
} = {}): MileZeroApi {
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = body as { error?: string; code?: string };
      throw new ApiError(
        error.error ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        response.status,
        error.code,
      );
    }
    return body as T;
  }

  return {
    evaluateFriction: (features: FrictionFeatures) =>
      request<FrictionDecision>("/v1/friction/evaluate", {
        method: "POST",
        body: JSON.stringify({ features }),
      }),
    createQuestion: (features: FrictionFeatures) =>
      request<QuestionPlan | null>("/v1/questions", {
        method: "POST",
        body: JSON.stringify({ features }),
      }),
    submitReport: ({ driverId, ...body }: ReportInput) =>
      request<ReportReceipt>("/v1/reports", {
        method: "POST",
        headers: { "x-driver-id": driverId },
        body: JSON.stringify(body),
      }),
    getKnowledge: ({ driverId, placeId, vehicleType }) => {
      const query = new URLSearchParams({ placeId, vehicleType });
      return request<DeliveryKnowledge>(`/v1/knowledge?${query}`, {
        headers: { "x-driver-id": driverId },
      });
    },
    recordFeedback: ({ driverId, ...body }) =>
      request<FeedbackResult>("/v1/feedback", {
        method: "POST",
        headers: { "x-driver-id": driverId },
        body: JSON.stringify(body),
      }),
  };
}

export async function fileToMedia(file: File): Promise<MediaInput> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(new Error("파일을 읽지 못했습니다.")),
    );
    reader.readAsDataURL(file);
  });
  const delimiter = dataUrl.indexOf(",");
  if (delimiter === -1) {
    throw new Error("파일을 base64로 변환하지 못했습니다.");
  }
  return { mimeType: file.type, dataBase64: dataUrl.slice(delimiter + 1) };
}
