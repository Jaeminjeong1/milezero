import { useCallback, useEffect, useRef, useState } from "react";

import { fileToMedia } from "../api";
import type {
  MileZeroApi,
  QuestionAnswer,
  QuestionPlan,
  ReportReceipt,
} from "../types";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
]);

const DEMO_FEATURES = {
  dwellSeconds: 420,
  stopCount: 3,
  travelMeters: 90,
  displacementMeters: 20,
  acceptedSampleCount: 8,
};

type Submission = { text?: string; file?: File };
export type ReporterPhase =
  | "delivering"
  | "friction_detected"
  | "loading_questions"
  | "asking"
  | "optional_detail"
  | "submitting"
  | "rewarded"
  | "no_issue"
  | "error";

export function useReporterJourney(
  api: MileZeroApi,
  { autoDetectDelayMs = 1_100 }: { autoDetectDelayMs?: number } = {},
) {
  const [phase, setPhase] = useState<ReporterPhase>("delivering");
  const [questionPlan, setQuestionPlan] = useState<QuestionPlan | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [run, setRun] = useState(0);
  const idempotencyKey = useRef(createIdempotencyKey());
  const lastSubmission = useRef<Submission | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPhase((current) =>
        current === "delivering" ? "friction_detected" : current,
      );
    }, autoDetectDelayMs);
    return () => window.clearTimeout(timer);
  }, [autoDetectDelayMs, run]);

  const completeDelivery = useCallback(async () => {
    setErrorMessage(undefined);
    setPhase("loading_questions");
    try {
      const plan = await api.createQuestion(DEMO_FEATURES);
      if (!plan?.shouldAsk) {
        setPhase("no_issue");
        return;
      }
      setQuestionPlan(plan);
      setCurrentQuestionIndex(0);
      setAnswers([]);
      setPhase("asking");
    } catch (error) {
      setErrorMessage(messageFrom(error));
      setPhase("error");
    }
  }, [api]);

  const selectAnswer = useCallback(
    (choice: string) => {
      const item = questionPlan?.questions[currentQuestionIndex];
      if (!item) return;
      if (currentQuestionIndex === 0 && choice === "불편하지 않았어요") {
        setAnswers([]);
        setPhase("no_issue");
        return;
      }

      const answer = {
        questionId: item.id,
        question: item.question,
        choice,
      };
      setAnswers((current) => [...current, answer]);
      if (currentQuestionIndex + 1 < questionPlan.questions.length) {
        setCurrentQuestionIndex((index) => index + 1);
      } else {
        setPhase("optional_detail");
      }
    },
    [currentQuestionIndex, questionPlan],
  );

  const send = useCallback(
    async (submission: Submission) => {
      lastSubmission.current = submission;
      setErrorMessage(undefined);
      setPhase("submitting");
      try {
        if (submission.file?.size && submission.file.size > MAX_MEDIA_BYTES) {
          throw new Error("사진과 음성은 8MB 이하만 보낼 수 있어요.");
        }
        if (submission.file && !SUPPORTED_MEDIA.has(submission.file.type)) {
          throw new Error(
            "JPG, PNG, WebP 또는 지원되는 음성 파일만 보낼 수 있어요.",
          );
        }
        const media = submission.file
          ? await fileToMedia(submission.file)
          : undefined;
        const nextReceipt = await api.submitReport({
          driverId: "demo-driver-a",
          idempotencyKey: idempotencyKey.current,
          placeId: "demo-office-tower",
          vehicleType: "1TON",
          contribution: {
            answers,
            text: submission.text?.trim() || undefined,
            media,
          },
        });
        setReceipt(nextReceipt);
        lastSubmission.current = undefined;
        setPhase("rewarded");
      } catch (error) {
        setErrorMessage(messageFrom(error));
        setPhase("error");
      }
    },
    [answers, api],
  );

  const replay = useCallback(() => {
    setPhase("delivering");
    setQuestionPlan(null);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setReceipt(null);
    setErrorMessage(undefined);
    lastSubmission.current = undefined;
    idempotencyKey.current = createIdempotencyKey();
    setRun((value) => value + 1);
  }, []);

  const retry = useCallback(async () => {
    if (lastSubmission.current) {
      await send(lastSubmission.current);
      return;
    }
    await completeDelivery();
  }, [completeDelivery, send]);

  return {
    phase,
    questionPlan,
    currentQuestion: questionPlan?.questions[currentQuestionIndex] ?? null,
    currentQuestionIndex,
    answers,
    receipt,
    errorMessage,
    completeDelivery,
    selectAnswer,
    submitContribution: send,
    replay,
    retry,
  };
}

function createIdempotencyKey() {
  return `web-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}
