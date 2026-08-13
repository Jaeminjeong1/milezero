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
} from "@/domain/contracts";
import type { AnalysisModelInput } from "@/knowledge/analyzer";
import type {
  ClaimMatcher,
  ClaimMatchResult,
} from "@/pipeline/pipeline";
import type { QuestionGenerator } from "@/questions/planner";
import {
  CLAIM_MATCH_SYSTEM_PROMPT,
  KNOWLEDGE_SYSTEM_PROMPT,
  QUESTION_SYSTEM_PROMPT,
  buildClaimMatchEvidence,
  buildKnowledgeEvidence,
  buildQuestionEvidence,
} from "./prompts";

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
            text: buildQuestionEvidence(input),
          },
        ],
      },
      config: {
        temperature: 0.2,
        systemInstruction: QUESTION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(QuestionPlanSchema),
      },
    }, QuestionPlanSchema);
  };

  async generateKnowledge(input: AnalysisModelInput) {
    const parts: Part[] = [
      {
        text: buildKnowledgeEvidence(input),
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
        systemInstruction: KNOWLEDGE_SYSTEM_PROMPT,
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
              text: buildClaimMatchEvidence(candidate, existing),
            },
          ],
        },
        config: {
          temperature: 0,
          systemInstruction: CLAIM_MATCH_SYSTEM_PROMPT,
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
