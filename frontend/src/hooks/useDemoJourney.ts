import { useCallback, useEffect, useRef, useState } from "react";

import { fileToMedia } from "../api";
import type {
  DeliveryKnowledge,
  FeedbackType,
  MileZeroApi,
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
export type JourneyPhase =
  | "detecting"
  | "question"
  | "contribution"
  | "submitting"
  | "rewarded"
  | "error";

export function useDemoJourney(
  api: MileZeroApi,
  { autoDetectDelayMs = 1_100 }: { autoDetectDelayMs?: number } = {},
) {
  const [phase, setPhase] = useState<JourneyPhase>("detecting");
  const [question, setQuestion] = useState<QuestionPlan | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string>();
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [knowledge, setKnowledge] = useState<DeliveryKnowledge>();
  const [totalPoints, setTotalPoints] = useState(0);
  const [guideFeedback, setGuideFeedback] = useState<FeedbackType>();
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [run, setRun] = useState(0);
  const idempotencyKey = useRef(createIdempotencyKey());
  const lastSubmission = useRef<Submission | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const plan = await api.createQuestion(DEMO_FEATURES);
        if (!active || !plan?.shouldAsk) return;
        setQuestion(plan);
        setPhase("question");
      } catch (error) {
        if (!active) return;
        setErrorMessage(messageFrom(error));
        setPhase("error");
      }
    }, autoDetectDelayMs);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, autoDetectDelayMs, run]);

  const replay = useCallback(() => {
    setPhase("detecting");
    setQuestion(null);
    setSelectedChoice(undefined);
    setReceipt(null);
    setErrorMessage(undefined);
    setKnowledge(undefined);
    setTotalPoints(0);
    setGuideFeedback(undefined);
    lastSubmission.current = undefined;
    idempotencyKey.current = createIdempotencyKey();
    setRun((value) => value + 1);
  }, []);

  const selectChoice = useCallback((choice: string) => {
    setSelectedChoice(choice);
    setPhase("contribution");
  }, []);

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
          throw new Error("JPG, PNG, WebP 또는 지원되는 음성 파일만 보낼 수 있어요.");
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
            answerChoice: selectedChoice,
            text: submission.text?.trim() || undefined,
            media,
          },
        });
        setReceipt(nextReceipt);
        setTotalPoints(nextReceipt.awardedPoints);
        lastSubmission.current = undefined;
        setPhase("rewarded");
      } catch (error) {
        setErrorMessage(messageFrom(error));
        setPhase("error");
      }
    },
    [api, selectedChoice],
  );

  const retrySubmission = useCallback(async () => {
    if (lastSubmission.current) await send(lastSubmission.current);
    else replay();
  }, [replay, send]);

  const openNextDelivery = useCallback(async () => {
    setKnowledgeLoading(true);
    setErrorMessage(undefined);
    try {
      setKnowledge(
        await api.getKnowledge({
          driverId: "demo-driver-b",
          placeId: "demo-office-tower",
          vehicleType: "1TON",
        }),
      );
    } catch (error) {
      setErrorMessage(messageFrom(error));
    } finally {
      setKnowledgeLoading(false);
    }
  }, [api]);

  const confirmPending = useCallback(
    async (feedback: Extract<FeedbackType, "CONFIRM" | "CONTRADICT">) => {
      const pending = knowledge?.pendingConfirmation;
      if (!pending) return;
      setKnowledgeLoading(true);
      setErrorMessage(undefined);
      try {
        const result = await api.recordFeedback({
          driverId: "demo-driver-b",
          claimId: pending.claimId,
          feedback,
        });
        if (result.status === "VERIFIED") {
          setTotalPoints((points) => Math.max(points, 30));
        }
        setKnowledge(
          await api.getKnowledge({
            driverId: "demo-driver-c",
            placeId: "demo-office-tower",
            vehicleType: "1TON",
          }),
        );
      } catch (error) {
        setErrorMessage(messageFrom(error));
      } finally {
        setKnowledgeLoading(false);
      }
    },
    [api, knowledge],
  );

  const rateGuide = useCallback(
    async (feedback: Extract<FeedbackType, "HELPFUL" | "CONTRADICT">) => {
      const guide = knowledge?.items[0];
      if (!guide) return;
      setKnowledgeLoading(true);
      setErrorMessage(undefined);
      try {
        await api.recordFeedback({
          driverId: "demo-driver-c",
          claimId: guide.claimId,
          feedback,
        });
        setGuideFeedback(feedback);
        if (feedback === "HELPFUL") {
          setTotalPoints((points) => Math.max(points, 35));
        }
      } catch (error) {
        setErrorMessage(messageFrom(error));
      } finally {
        setKnowledgeLoading(false);
      }
    },
    [api, knowledge],
  );

  return {
    phase,
    question,
    selectedChoice,
    receipt,
    errorMessage,
    knowledge,
    knowledgeLoading,
    totalPoints,
    guideFeedback,
    replay,
    selectChoice,
    submitContribution: send,
    retrySubmission,
    openNextDelivery,
    confirmPending,
    rateGuide,
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
