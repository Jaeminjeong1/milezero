import { CheckCircle, ThumbsDown, ThumbsUp, Warning } from "@phosphor-icons/react";

import type { ReceiverPhase } from "../hooks/useReceiverJourney";

export function ReceiverFeedbackSheet({
  phase,
  loading,
  completionMessage,
  onFact,
  onUtility,
}: {
  phase: Extract<
    ReceiverPhase,
    "fact_feedback" | "utility_feedback" | "feedback_complete"
  >;
  loading: boolean;
  completionMessage: string;
  onFact(feedback: "CONFIRM" | "CONTRADICT"): void;
  onUtility(feedback: "HELPFUL" | "NOT_HELPFUL"): void;
}) {
  const complete = phase === "feedback_complete";
  return (
    <div className="sheet-backdrop">
      <section
        className="bottom-sheet receiver-feedback-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiver-feedback-title"
      >
        <div className="sheet-handle" />
        {complete ? (
          <>
            <div className="sheet-title-icon success-icon">
              <CheckCircle weight="fill" aria-hidden="true" />
            </div>
            <h2 id="receiver-feedback-title">현장 확인을 반영했어요</h2>
            <p className="feedback-completion" role="status">{completionMessage}</p>
          </>
        ) : phase === "fact_feedback" ? (
          <>
            <div className="sheet-title-icon"><Warning weight="fill" aria-hidden="true" /></div>
            <h2 id="receiver-feedback-title">안내받은 정보가 실제 현장과 같았나요?</h2>
            <p className="sheet-description">사실 여부와 도움 여부를 따로 받아 지식을 안전하게 관리해요.</p>
            <div className="binary-actions feedback-choice-actions">
              <button type="button" className="confirm-button" disabled={loading} onClick={() => onFact("CONFIRM")}><CheckCircle weight="fill" aria-hidden="true" />맞았어요</button>
              <button type="button" className="subtle-button" disabled={loading} onClick={() => onFact("CONTRADICT")}><Warning weight="fill" aria-hidden="true" />정보가 달랐어요</button>
            </div>
          </>
        ) : (
          <>
            <div className="sheet-title-icon"><ThumbsUp weight="fill" aria-hidden="true" /></div>
            <h2 id="receiver-feedback-title">이 안내가 배송에 도움이 됐나요?</h2>
            <p className="sheet-description">도움 여부는 안내 순위에만 반영하고 사실 상태는 바꾸지 않아요.</p>
            <div className="binary-actions feedback-choice-actions">
              <button type="button" className="confirm-button" disabled={loading} onClick={() => onUtility("HELPFUL")}><ThumbsUp weight="fill" aria-hidden="true" />도움됐어요</button>
              <button type="button" className="subtle-button" disabled={loading} onClick={() => onUtility("NOT_HELPFUL")}><ThumbsDown weight="fill" aria-hidden="true" />도움은 없었어요</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
