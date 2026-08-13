import {
  KnowledgeAnalysisSchema,
  type KnowledgeAnalysis,
  type PiiType,
} from "@/domain/contracts";
import { sanitizeText } from "@/privacy/sanitizer";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export type ContributionInput = {
  answers: QuestionAnswer[];
  text?: string;
  media?: {
    mimeType: string;
    bytes: Uint8Array;
    removedPiiTypes?: PiiType[];
  };
};

export type QuestionAnswer = {
  questionId: string;
  question: string;
  choice: string;
};

export type AnalysisModelInput = {
  answers: QuestionAnswer[];
  sanitizedText: string;
  media?: {
    mimeType: string;
    dataBase64: string;
  };
};

export type KnowledgeGenerator = (
  input: AnalysisModelInput,
) => Promise<unknown>;

function mergePiiTypes(groups: PiiType[][]): PiiType[] {
  return [...new Set(groups.flat())];
}

export async function analyzeContribution(
  input: ContributionInput,
  generate: KnowledgeGenerator,
): Promise<KnowledgeAnalysis> {
  if (
    input.media &&
    !input.media.mimeType.startsWith("image/") &&
    !input.media.mimeType.startsWith("audio/")
  ) {
    throw new Error("미디어 입력은 이미지와 음성만 지원합니다.");
  }
  if (input.media && input.media.bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error("미디어 입력은 8MB 이하여야 합니다.");
  }

  const preSanitized = sanitizeText(input.text ?? "");
  const sanitizedAnswers = input.answers.map((answer) => {
    const questionId = sanitizeText(answer.questionId);
    const question = sanitizeText(answer.question);
    const choice = sanitizeText(answer.choice);
    return {
      answer: {
        questionId: questionId.text,
        question: question.text,
        choice: choice.text,
      },
      removedPiiTypes: [
        ...questionId.removedPiiTypes,
        ...question.removedPiiTypes,
        ...choice.removedPiiTypes,
      ],
    };
  });
  const modelResult = KnowledgeAnalysisSchema.parse(
    await generate({
      answers: sanitizedAnswers.map(({ answer }) => answer),
      sanitizedText: preSanitized.text,
      media: input.media
        ? {
            mimeType: input.media.mimeType,
            dataBase64: Buffer.from(input.media.bytes).toString("base64"),
          }
        : undefined,
    }),
  );
  const sanitizedSummary = sanitizeText(modelResult.sanitizedSummary);
  const claimSanitizations = modelResult.claims.map((claim) => ({
    value: sanitizeText(claim.value),
    timeCondition: claim.timeCondition
      ? sanitizeText(claim.timeCondition)
      : undefined,
  }));

  return {
    sanitizedSummary: sanitizedSummary.text,
    removedPiiTypes: mergePiiTypes([
      preSanitized.removedPiiTypes,
      ...sanitizedAnswers.map(({ removedPiiTypes }) => removedPiiTypes),
      input.media?.removedPiiTypes ?? [],
      modelResult.removedPiiTypes,
      sanitizedSummary.removedPiiTypes,
      ...claimSanitizations.flatMap((claim) => [
        claim.value.removedPiiTypes,
        claim.timeCondition?.removedPiiTypes ?? [],
      ]),
    ]),
    claims: modelResult.claims.map((claim, index) => ({
      ...claim,
      value: claimSanitizations[index].value.text,
      timeCondition:
        claimSanitizations[index].timeCondition?.text ?? claim.timeCondition,
    })),
  };
}
