import { Crosshair, ShieldCheck } from "@phosphor-icons/react";
import type { ReporterPhase } from "../hooks/useReporterJourney";

export function StatusCard({
  phase,
  onCompleteDelivery,
  onReplay,
}: {
  phase: ReporterPhase;
  onCompleteDelivery(): void;
  onReplay(): void;
}) {
  const frictionDetected = phase !== "delivering";
  const noIssue = phase === "no_issue";
  return (
    <section className="status-card" aria-live="polite">
      <div className="status-icon"><Crosshair weight="bold" aria-hidden="true" /></div>
      <div className="status-copy">
        <span className="live-dot" />
        <p className="eyebrow">
          {frictionDetected ? "GPS 기반 이상 탐지" : "현장 신호 분석 중"}
        </p>
        <h2>
          {noIssue
            ? "불편 없음으로 기록했어요"
            : frictionDetected
              ? "이 배송은 평균보다 시간이 더 걸렸어요"
              : "배송 마찰을 자동으로 찾고 있어요"}
        </h2>
        <p>
          {frictionDetected
            ? "정지 3회 · 체류 7분 · 짧은 반복 이동"
            : "GPS 집계 특징을 기기에서 살펴보고 있어요"}
        </p>
      </div>
      {phase === "friction_detected" || phase === "loading_questions" ? (
        <button
          type="button"
          className="primary-button status-action"
          disabled={phase === "loading_questions"}
          onClick={onCompleteDelivery}
        >
          {phase === "loading_questions" ? "질문을 준비하고 있어요" : "배송 완료했어요"}
        </button>
      ) : (
        <button type="button" className="text-button" onClick={onReplay}>
          데모 다시 보기
        </button>
      )}
      <div className="safe-strip">
        <ShieldCheck weight="fill" aria-hidden="true" />
        <span><strong>GPS 원본은 저장하지 않아요</strong><br />기기에서 계산한 집계 특징만 사용합니다.</span>
      </div>
    </section>
  );
}
