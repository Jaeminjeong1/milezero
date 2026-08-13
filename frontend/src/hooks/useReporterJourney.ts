import { useCallback, useRef, useState } from "react";

import { fileToMedia } from "../api";
import { summarizeGps } from "../gps/aggregator";
import {
  GPS_SCENARIOS,
  type GpsScenarioId,
} from "../gps/scenarios";
import type {
  FrictionDecision,
  FrictionFeatures,
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

type Submission = { text?: string; file?: File };
type FailedOperation =
  | { kind: "scenario"; scenarioId: GpsScenarioId }
  | { kind: "questions" }
  | { kind: "submission"; submission: Submission };

export type ReporterPhase =
  | "delivering"
  | "detecting_friction"
  | "friction_detected"
  | "friction_not_detected"
  | "loading_questions"
  | "asking"
  | "optional_detail"
  | "submitting"
  | "rewarded"
  | "no_issue"
  | "error";

export function useReporterJourney(api: MileZeroApi) {
  const [phase, setPhase] = useState<ReporterPhase>("delivering");
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<GpsScenarioId>();
  const [features, setFeatures] = useState<FrictionFeatures>();
  const [decision, setDecision] = useState<FrictionDecision>();
  const [questionPlan, setQuestionPlan] = useState<QuestionPlan | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const idempotencyKey = useRef(createIdempotencyKey());
  const lastFailed = useRef<FailedOperation | undefined>(undefined);

  const reset = useCallback(() => {
    setPhase("delivering");
    setSelectedScenarioId(undefined);
    setFeatures(undefined);
    setDecision(undefined);
    setQuestionPlan(null);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setReceipt(null);
    setErrorMessage(undefined);
    lastFailed.current = undefined;
    idempotencyKey.current = createIdempotencyKey();
  }, []);

  const triggerScenario = useCallback(
    async (scenarioId: GpsScenarioId) => {
      reset();
      const scenario = GPS_SCENARIOS[scenarioId];
      const nextFeatures = summarizeGps(scenario.samples);
      setSelectedScenarioId(scenarioId);
      setFeatures(nextFeatures);
      setPhase("detecting_friction");
      lastFailed.current = { kind: "scenario", scenarioId };
      try {
        const nextDecision = await api.evaluateFriction(nextFeatures);
        setDecision(nextDecision);
        lastFailed.current = undefined;
        setPhase(
          nextDecision.detected
            ? "friction_detected"
            : "friction_not_detected",
        );
      } catch (error) {
        setErrorMessage(messageFrom(error));
        setPhase("error");
      }
    },
    [api, reset],
  );

  const completeDelivery = useCallback(async () => {
    if (!features || !decision?.detected) return;
    setErrorMessage(undefined);
    setPhase("loading_questions");
    lastFailed.current = { kind: "questions" };
    try {
      const plan = await api.createQuestion(features);
      if (!plan?.shouldAsk) {
        lastFailed.current = undefined;
        setPhase("no_issue");
        return;
      }
      setQuestionPlan(plan);
      setCurrentQuestionIndex(0);
      setAnswers([]);
      lastFailed.current = undefined;
      setPhase("asking");
    } catch (error) {
      setErrorMessage(messageFrom(error));
      setPhase("error");
    }
  }, [api, decision, features]);

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
      lastFailed.current = { kind: "submission", submission };
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
        lastFailed.current = undefined;
        setPhase("rewarded");
      } catch (error) {
        setErrorMessage(messageFrom(error));
        setPhase("error");
      }
    },
    [answers, api],
  );

  const retry = useCallback(async () => {
    const failed = lastFailed.current;
    if (!failed) return;
    if (failed.kind === "scenario") {
      await triggerScenario(failed.scenarioId);
    } else if (failed.kind === "questions") {
      await completeDelivery();
    } else {
      await send(failed.submission);
    }
  }, [completeDelivery, send, triggerScenario]);

  return {
    phase,
    selectedScenarioId,
    scenario: selectedScenarioId ? GPS_SCENARIOS[selectedScenarioId] : null,
    features,
    decision,
    questionPlan,
    currentQuestion: questionPlan?.questions[currentQuestionIndex] ?? null,
    currentQuestionIndex,
    answers,
    receipt,
    errorMessage,
    triggerScenario,
    completeDelivery,
    selectAnswer,
    submitContribution: send,
    replay: reset,
    reset,
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
