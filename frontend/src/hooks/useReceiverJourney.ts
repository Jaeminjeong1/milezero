import { useCallback, useRef, useState } from "react";

import type {
  DeliveryKnowledge,
  MileZeroApi,
} from "../types";

type FactFeedback = "CONFIRM" | "CONTRADICT";
type UtilityFeedback = "HELPFUL" | "NOT_HELPFUL";
type FailedFeedback =
  | { kind: "guide" }
  | { kind: "fact"; feedback: FactFeedback }
  | { kind: "utility"; feedback: UtilityFeedback };

export type ReceiverPhase =
  | "idle"
  | "loading_guide"
  | "guide_ready"
  | "fact_feedback"
  | "utility_feedback"
  | "feedback_complete"
  | "error";

export function useReceiverJourney(api: MileZeroApi) {
  const [phase, setPhase] = useState<ReceiverPhase>("idle");
  const [knowledge, setKnowledge] = useState<DeliveryKnowledge>();
  const [factFeedback, setFactFeedback] = useState<FactFeedback>();
  const [utilityFeedback, setUtilityFeedback] = useState<UtilityFeedback>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const lastFailed = useRef<FailedFeedback | undefined>(undefined);

  const reset = useCallback(() => {
    setPhase("idle");
    setKnowledge(undefined);
    setFactFeedback(undefined);
    setUtilityFeedback(undefined);
    setErrorMessage(undefined);
    setFeedbackLoading(false);
    lastFailed.current = undefined;
  }, []);

  const openGuide = useCallback(async () => {
    setPhase("loading_guide");
    setErrorMessage(undefined);
    lastFailed.current = { kind: "guide" };
    try {
      const nextKnowledge = await api.getKnowledge({
        driverId: "demo-driver-b",
        placeId: "demo-office-tower",
        vehicleType: "1TON",
      });
      if (!nextKnowledge.items[0]) {
        throw new Error("아직 확인된 현장 가이드가 없어요.");
      }
      setKnowledge(nextKnowledge);
      lastFailed.current = undefined;
      setPhase("guide_ready");
    } catch (error) {
      setErrorMessage(messageFrom(error));
      setPhase("error");
    }
  }, [api]);

  const completeDelivery = useCallback(() => {
    if (knowledge?.items[0]) setPhase("fact_feedback");
  }, [knowledge]);

  const answerFact = useCallback(
    async (feedback: FactFeedback) => {
      const guide = knowledge?.items[0];
      if (!guide) return;
      setFeedbackLoading(true);
      setErrorMessage(undefined);
      lastFailed.current = { kind: "fact", feedback };
      try {
        await api.recordFeedback({
          driverId: "demo-driver-b",
          claimId: guide.claimId,
          feedback,
        });
        setFactFeedback(feedback);
        lastFailed.current = undefined;
        setPhase("utility_feedback");
      } catch (error) {
        setErrorMessage(messageFrom(error));
        setPhase("error");
      } finally {
        setFeedbackLoading(false);
      }
    },
    [api, knowledge],
  );

  const answerUtility = useCallback(
    async (feedback: UtilityFeedback) => {
      const guide = knowledge?.items[0];
      if (!guide) return;
      setFeedbackLoading(true);
      setErrorMessage(undefined);
      lastFailed.current = { kind: "utility", feedback };
      try {
        await api.recordFeedback({
          driverId: "demo-driver-b",
          claimId: guide.claimId,
          feedback,
        });
        setUtilityFeedback(feedback);
        lastFailed.current = undefined;
        setPhase("feedback_complete");
      } catch (error) {
        setErrorMessage(messageFrom(error));
        setPhase("error");
      } finally {
        setFeedbackLoading(false);
      }
    },
    [api, knowledge],
  );

  const retryFeedback = useCallback(async () => {
    const failed = lastFailed.current;
    if (!failed || failed.kind === "guide") {
      await openGuide();
    } else if (failed.kind === "fact") {
      await answerFact(failed.feedback);
    } else {
      await answerUtility(failed.feedback);
    }
  }, [answerFact, answerUtility, openGuide]);

  const completionMessage =
    factFeedback === "CONTRADICT"
      ? "변경 신호를 저장했어요. 독립 확인 2건이면 안내를 중단해요."
      : utilityFeedback === "HELPFUL"
        ? "다음 기사에게도 이 안내를 유지할게요."
        : "사실 정보는 유지하고 안내 우선순위를 조정할게요.";

  return {
    phase,
    knowledge,
    guide: knowledge?.items[0] ?? null,
    factFeedback,
    utilityFeedback,
    completionMessage,
    errorMessage,
    feedbackLoading,
    openGuide,
    completeDelivery,
    answerFact,
    answerUtility,
    retryFeedback,
    reset,
  };
}

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}
