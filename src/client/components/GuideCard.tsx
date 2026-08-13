import { Buildings, CheckCircle, NavigationArrow, ThumbsUp, Warning } from "@phosphor-icons/react";

export function GuideCard({
  text,
  confidence,
  feedback,
  loading,
  onHelpful,
  onChanged,
}: {
  text: string;
  confidence: number;
  feedback?: "HELPFUL" | "CONTRADICT";
  loading: boolean;
  onHelpful(): void;
  onChanged(): void;
}) {
  return (
    <section className="guide-card" aria-labelledby="guide-title">
      <div className="guide-visual">
        <div className="building-node"><Buildings weight="fill" aria-hidden="true" /></div>
        <div className="route-dash" />
        <div className="entrance-node"><NavigationArrow weight="fill" aria-hidden="true" /></div>
      </div>
      <div className="guide-status"><span><CheckCircle weight="fill" aria-hidden="true" />기사 확인 완료</span><strong>신뢰도 {Math.round(confidence * 100)}%</strong></div>
      <h2 id="guide-title">검증된 현장 가이드</h2>
      <div className="guide-action-text"><small>권장 진입</small><strong>{text}</strong></div>
      <div className="guide-meta"><span>1톤 차량</span><span>방금 확인</span><span>합성 시나리오</span></div>
      {feedback ? (
        <div className={feedback === "HELPFUL" ? "feedback-success" : "feedback-warning"} role="status">
          {feedback === "HELPFUL" ? <ThumbsUp weight="fill" aria-hidden="true" /> : <Warning weight="fill" aria-hidden="true" />}
          <span>{feedback === "HELPFUL" ? "제보자에게 5P가 추가됐어요" : "변경 신호를 반영해 다시 검증할게요"}</span>
        </div>
      ) : (
        <div className="guide-feedback">
          <p>배송에 이 정보가 도움이 됐나요?</p>
          <div className="binary-actions">
            <button type="button" className="confirm-button" disabled={loading} onClick={onHelpful}><ThumbsUp weight="fill" aria-hidden="true" />도움됐어요</button>
            <button type="button" className="subtle-button" disabled={loading} onClick={onChanged}><Warning weight="fill" aria-hidden="true" />정보가 달라요</button>
          </div>
        </div>
      )}
    </section>
  );
}
