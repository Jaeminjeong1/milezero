import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import Fastify from "fastify";
import { z, ZodError } from "zod";

import { ClaimSchema } from "@/domain/contracts";
import {
  ClaimNotFoundError,
  IndependentVerificationError,
  InvalidContributionError,
} from "@/domain/errors";
import { GeminiUnavailableError } from "@/gemini/gateway";
import { InvalidMediaError, prepareMedia } from "@/media/validator";
import type { BackendPipeline } from "@/pipeline/pipeline";

const DriverHeaderSchema = z.string().trim().min(1).max(100);
const VehicleTypeSchema = ClaimSchema.shape.vehicleType;
const FrictionFeaturesSchema = z
  .object({
    dwellSeconds: z.number().nonnegative(),
    stopCount: z.number().int().nonnegative(),
    travelMeters: z.number().nonnegative(),
    displacementMeters: z.number().nonnegative(),
    acceptedSampleCount: z.number().int().nonnegative(),
  })
  .strict();
const QuestionBodySchema = z
  .object({ features: FrictionFeaturesSchema })
  .strict();
const MediaSchema = z
  .object({
    mimeType: z.string().min(1).max(100),
    dataBase64: z.string().min(1).max(11_184_812),
  })
  .strict();
const QuestionAnswerSchema = z
  .object({
    questionId: z.string().trim().min(1).max(40),
    question: z.string().trim().min(1).max(120),
    choice: z.string().trim().min(1).max(120),
  })
  .strict();
const ReportBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(100),
    placeId: z.string().trim().min(1).max(200),
    vehicleType: VehicleTypeSchema,
    contribution: z
      .object({
        answers: z.array(QuestionAnswerSchema).min(1).max(2),
        text: z.string().max(2_000).optional(),
        media: MediaSchema.optional(),
      })
      .strict(),
  })
  .strict();
const KnowledgeQuerySchema = z.object({
  placeId: z.string().trim().min(1).max(200),
  vehicleType: VehicleTypeSchema,
});
const FeedbackBodySchema = z
  .object({
    claimId: z.string().trim().min(1).max(100),
    feedback: z.enum(["CONFIRM", "CONTRADICT", "HELPFUL"]),
  })
  .strict();

class UnauthorizedError extends Error {}

export function buildServer(
  pipeline: BackendPipeline,
  options: {
    readiness?: () => Promise<unknown>;
    corsOrigins?: string[];
    clientDistPath?: string;
  } = {},
) {
  const server = Fastify({
    logger: false,
    bodyLimit: 12 * 1024 * 1024,
  });

  const corsOrigins = new Set(options.corsOrigins ?? []);
  void server.register(cors, {
    origin: (origin, callback) => {
      callback(null, origin !== undefined && corsOrigins.has(origin));
    },
  });

  if (options.clientDistPath) {
    void server.register(staticFiles, {
      root: options.clientDistPath,
      prefix: "/",
    });
    server.setNotFoundHandler((request, reply) => {
      if (
        request.method === "GET" &&
        !request.url.startsWith("/v1/") &&
        request.url !== "/health" &&
        request.url !== "/ready"
      ) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "요청한 API를 찾을 수 없습니다." });
    });
  }

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/ready", async (_request, reply) => {
    try {
      await options.readiness?.();
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  server.post("/v1/questions", async (request) => {
    const body = QuestionBodySchema.parse(request.body);
    return pipeline.createQuestionFromFeatures(body.features);
  });

  server.post("/v1/reports", async (request, reply) => {
    const driverId = parseDriverId(request.headers["x-driver-id"]);
    const body = ReportBodySchema.parse(request.body);
    const receipt = await pipeline.submitContribution({
      idempotencyKey: body.idempotencyKey,
      placeId: body.placeId,
      driverId,
      vehicleType: body.vehicleType,
      contribution: {
        answers: body.contribution.answers,
        text: body.contribution.text,
        media: body.contribution.media
          ? prepareMedia(body.contribution.media)
          : undefined,
      },
    });
    return reply.code(201).send(receipt);
  });

  server.get("/v1/knowledge", async (request) => {
    const driverId = parseDriverId(request.headers["x-driver-id"]);
    const query = KnowledgeQuerySchema.parse(request.query);
    return pipeline.getDeliveryKnowledge({ ...query, driverId });
  });

  server.post("/v1/feedback", async (request) => {
    const driverId = parseDriverId(request.headers["x-driver-id"]);
    const body = FeedbackBodySchema.parse(request.body);
    return pipeline.recordFeedback({ ...body, driverId });
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof UnauthorizedError) {
      return reply.code(401).send({ error: "기사 식별자가 필요합니다." });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "요청 형식이 올바르지 않습니다.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    if (error instanceof InvalidMediaError) {
      return reply.code(400).send({
        code: "INVALID_MEDIA",
        error: error.message,
      });
    }
    if (error instanceof InvalidContributionError) {
      return reply.code(422).send({
        code: "NO_ACTIONABLE_KNOWLEDGE",
        error: error.message,
      });
    }
    if (error instanceof ClaimNotFoundError) {
      return reply.code(404).send({ code: "CLAIM_NOT_FOUND", error: error.message });
    }
    if (error instanceof IndependentVerificationError) {
      return reply.code(409).send({
        code: "INDEPENDENT_VERIFICATION_REQUIRED",
        error: error.message,
      });
    }
    if (error instanceof GeminiUnavailableError) {
      return reply.code(503).send({
        code: "DEPENDENCY_UNAVAILABLE",
        error: "AI 분석 서비스를 잠시 사용할 수 없습니다.",
      });
    }
    return reply.code(500).send({ error: "요청을 처리하지 못했습니다." });
  });

  return server;
}

function parseDriverId(value: string | string[] | undefined): string {
  const parsed = DriverHeaderSchema.safeParse(
    Array.isArray(value) ? value[0] : value,
  );
  if (!parsed.success) throw new UnauthorizedError();
  return parsed.data;
}
