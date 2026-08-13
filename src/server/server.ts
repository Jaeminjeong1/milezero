import Fastify from "fastify";
import { z, ZodError } from "zod";

import { ClaimSchema } from "@/domain/contracts";
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
const ReportBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(100),
    placeId: z.string().trim().min(1).max(200),
    vehicleType: VehicleTypeSchema,
    contribution: z
      .object({
        answerChoice: z.string().max(100).optional(),
        text: z.string().max(2_000).optional(),
        media: MediaSchema.optional(),
      })
      .strict()
      .refine(
        (input) => input.answerChoice || input.text || input.media,
        "응답 내용이 필요합니다.",
      ),
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

export function buildServer(pipeline: BackendPipeline) {
  const server = Fastify({
    logger: false,
    bodyLimit: 12 * 1024 * 1024,
  });

  server.get("/health", async () => ({ status: "ok" }));

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
        answerChoice: body.contribution.answerChoice,
        text: body.contribution.text,
        media: body.contribution.media
          ? {
              mimeType: body.contribution.media.mimeType,
              bytes: Buffer.from(body.contribution.media.dataBase64, "base64"),
            }
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
