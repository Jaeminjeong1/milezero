import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import { z } from "zod";

import {
  KnowledgeAnalysisSchema,
  QuestionPlanSchema,
  type Claim,
} from "@/domain/contracts";
import type { AnalysisModelInput } from "@/knowledge/analyzer";
import type {
  ClaimMatcher,
  ClaimMatchResult,
} from "@/pipeline/pipeline";
import type { QuestionGenerator } from "@/questions/planner";
import type { StoredClaim } from "@/storage/contracts";

const ClaimMatchSchema = z.discriminatedUnion("relation", [
  z.object({ relation: z.literal("NEW"), targetClaimId: z.null() }),
  z.object({
    relation: z.enum(["SUPPORTS", "CONTRADICTS"]),
    targetClaimId: z.string().min(1),
  }),
]);

type GenerateContent = (
  parameters: GenerateContentParameters,
) => Promise<GenerateContentResponse>;

type GeminiGatewayOptions = {
  model: string;
  generateContent: GenerateContent;
  timeoutMs?: number;
  maxAttempts?: number;
};

export class GeminiUnavailableError extends Error {
  override name = "GeminiUnavailableError";
}

export class GeminiGateway {
  private readonly model: string;
  private readonly generateContentRequest: GenerateContent;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(options: GeminiGatewayOptions) {
    this.model = options.model;
    this.generateContentRequest = options.generateContent;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxAttempts = options.maxAttempts ?? 2;
  }

  generateQuestion = async (input: Parameters<QuestionGenerator>[0]) => {
    return this.generateStructured({
      model: this.model,
      contents: {
        role: "user",
        parts: [
          {
            text: `GPS 원본이 아닌 집계된 배송 마찰 신호입니다. 적절한 후속 질문을 만드세요.\n${JSON.stringify(input)}`,
          },
        ],
      },
      config: {
        temperature: 0.2,
        systemInstruction:
          "배송기사의 책임이나 실수를 묻지 않는다. 배송지·시설 때문에 생긴 억울함과 불편함을 편하게 말할 수 있는 한국어 질문을 만든다. 1개의 기본 질문과 필요한 경우 맥락별 후속 질문 1개까지만 만든다. 질문별 선택지는 4~5개이며 첫 질문 선택지에는 반드시 '불편하지 않았어요'를 포함한다.",
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(QuestionPlanSchema),
      },
    }, QuestionPlanSchema);
  };

  async generateKnowledge(input: AnalysisModelInput) {
    const parts: Part[] = [
      {
        text:
          "기사 응답에서 다음 기사에게 도움이 되는 배송지 운영 지식만 추출하세요. " +
          "수령인 이름·연락처·이메일·동호수·출입 비밀번호·얼굴·차량번호·EXIF는 제거하고 removedPiiTypes에 기록하세요. " +
          "사실을 검증됐다고 단정하지 말고 원자 단위 후보 주장으로 만드세요.\n" +
          JSON.stringify({
            answers: input.answers,
            sanitizedText: input.sanitizedText,
          }),
      },
    ];
    if (input.media) {
      parts.push({
        inlineData: {
          mimeType: input.media.mimeType,
          data: input.media.dataBase64,
        },
      });
    }

    return this.generateStructured({
      model: this.model,
      contents: { role: "user", parts },
      config: {
        temperature: 0.1,
        systemInstruction:
          "당신은 개인정보를 저장하지 않는 배송지 지식 추출기다. 개인 식별 정보는 출력에 절대 복원하지 않고, 배송지 접근·정차·하역·엘리베이터·내부 이동에 관한 행동 가능한 정보만 구조화한다.",
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(KnowledgeAnalysisSchema),
      },
    }, KnowledgeAnalysisSchema);
  }

  matchClaim = async (
    candidate: Parameters<ClaimMatcher>[0],
    existing: Parameters<ClaimMatcher>[1],
  ): Promise<ClaimMatchResult> => {
    if (existing.length === 0) {
      return { relation: "NEW", targetClaimId: null };
    }
    try {
      return await this.generateStructured({
        model: this.model,
        contents: {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                candidate: publicClaim(candidate),
                existing: existing.map((claim) => ({
                  id: claim.id,
                  ...publicClaim(claim),
                })),
              }),
            },
          ],
        },
        config: {
          temperature: 0,
          systemInstruction:
            "후보 주장과 같은 장소의 기존 주장을 비교한다. 사실 여부를 판정하지 말고 의미 관계만 SUPPORTS, CONTRADICTS, NEW 중 하나로 분류한다. SUPPORTS 또는 CONTRADICTS이면 반드시 기존 targetClaimId를 반환한다.",
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(ClaimMatchSchema),
        },
      }, ClaimMatchSchema) as ClaimMatchResult;
    } catch {
      const normalizedCandidate = normalizeClaimText(candidate.value);
      const exact = existing.find(
        (claim) =>
          claim.type === candidate.type &&
          normalizeClaimText(claim.value) === normalizedCandidate,
      );
      return exact
        ? { relation: "SUPPORTS", targetClaimId: exact.id }
        : { relation: "NEW", targetClaimId: null };
    }
  };

  private async generateStructured<T>(
    parameters: GenerateContentParameters,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.generateWithTimeout(parameters);
        return schema.parse(parseResponseJson(response));
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts || !isRetryableGeminiError(error)) {
          break;
        }
      }
    }
    throw new GeminiUnavailableError(
      lastError instanceof Error ? lastError.message : "Gemini unavailable",
    );
  }

  private async generateWithTimeout(
    parameters: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.generateContentRequest({
          ...parameters,
          config: { ...parameters.config, abortSignal: controller.signal },
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new GeminiUnavailableError("Gemini request timed out"));
          }, this.timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

function publicClaim(claim: Claim | StoredClaim) {
  return {
    type: claim.type,
    value: claim.value,
    vehicleType: claim.vehicleType,
    timeCondition: claim.timeCondition,
  };
}

function parseResponseJson(response: GenerateContentResponse): unknown {
  if (!response.text) throw new Error("Gemini가 구조화 응답을 반환하지 않았습니다.");
  return JSON.parse(response.text);
}

function normalizeClaimText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isRetryableGeminiError(error: unknown): boolean {
  if (error instanceof SyntaxError || error instanceof z.ZodError) return true;
  if (error instanceof GeminiUnavailableError) return true;
  if (!(error instanceof Error)) return false;
  const status = "status" in error ? Number(error.status) : undefined;
  return status === 429 || (status !== undefined && status >= 500);
}

export function createGeminiGatewayFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GeminiGateway {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 필요합니다.");
  if (!model) throw new Error("GEMINI_MODEL이 필요합니다.");
  const client = new GoogleGenAI({ apiKey });
  return new GeminiGateway({
    model,
    generateContent: (parameters) => client.models.generateContent(parameters),
  });
}
