import {
  KnowledgeAnalysisSchema,
  type Claim,
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
  const fallbackClaim =
    modelResult.claims.length === 0
      ? createChoiceFallbackClaim(
          sanitizedAnswers.map(({ answer }) => answer),
        )
      : null;
  const sourceClaims = fallbackClaim ? [fallbackClaim] : modelResult.claims;
  const sourceSummary = fallbackClaim
    ? fallbackClaim.value
    : modelResult.sanitizedSummary;
  const sanitizedSummary = sanitizeText(sourceSummary);
  const claimSanitizations = sourceClaims.map((claim) => ({
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
    claims: sourceClaims.map((claim, index) => ({
      ...claim,
      value: claimSanitizations[index].value.text,
      timeCondition:
        claimSanitizations[index].timeCondition?.text ?? claim.timeCondition,
    })),
  };
}

function createChoiceFallbackClaim(answers: QuestionAnswer[]): Claim | null {
  const actionableAnswers = answers.filter((answer) => {
    const choice = answer.choice.trim();
    return choice && choice !== "불편하지 않았어요";
  });
  if (actionableAnswers.length === 0) return null;

  const preferredDetail = actionableAnswers.find(
    (answer) => answer.questionId === "actionable_detail",
  );
  const evidence =
    preferredDetail?.choice ??
    actionableAnswers.map((answer) => answer.choice).join(" ");
  const candidate = fallbackCandidate(evidence);
  return {
    ...candidate,
    vehicleType: "ALL",
    timeCondition: null,
  };
}

function fallbackCandidate(
  evidence: string,
): Pick<Claim, "type" | "value"> {
  if (/엘리베이터/.test(evidence)) {
    return {
      type: "ELEVATOR_GUIDE",
      value: "배송지에서 이용할 엘리베이터를 찾기 어려울 수 있음",
    };
  }
  if (/(정차|주차)/.test(evidence)) {
    return {
      type: "UNLOADING_LOCATION",
      value: "배송지 인근 정차 위치를 찾는 데 시간이 걸릴 수 있음",
    };
  }
  if (/(하역|짐을? 내리|내릴 공간)/.test(evidence)) {
    return {
      type: "UNLOADING_LOCATION",
      value: "배송지에서 하역 공간을 찾거나 이용하기 어려울 수 있음",
    };
  }
  if (/(출입구|입구|진입)/.test(evidence)) {
    return {
      type: "ENTRANCE_RECOMMENDATION",
      value: "배송지 출입구를 찾는 데 시간이 걸릴 수 있음",
    };
  }
  if (/(건물 안|건물 내부|내부 이동|이동 경로|길을 찾)/.test(evidence)) {
    return {
      type: "INTERNAL_ROUTE",
      value: "건물 내부 이동 경로를 찾는 데 시간이 걸릴 수 있음",
    };
  }
  if (/(출입 절차|출입 인증|보안)/.test(evidence)) {
    return {
      type: "ACCESS_PROCEDURE",
      value: "배송지 출입 절차를 확인하는 데 시간이 걸릴 수 있음",
    };
  }
  return {
    type: "ACCESS_PROCEDURE",
    value: "배송지 시설 또는 운영 절차를 미리 확인할 필요가 있음",
  };
}
