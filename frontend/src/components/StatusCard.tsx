import { Crosshair, ShieldCheck } from "@phosphor-icons/react";
import type { GpsScenario } from "../gps/scenarios";
import type { ReporterPhase } from "../hooks/useReporterJourney";
import type { FrictionDecision, FrictionFeatures } from "../types";

export function StatusCard({
  phase,
  scenario,
  features,
  decision,
  onCompleteDelivery,
}: {
  phase: ReporterPhase;
  scenario: GpsScenario | null;
  features?: FrictionFeatures;
  decision?: FrictionDecision;
  onCompleteDelivery(): void;
}) {
  const noIssue = phase === "no_issue";
  const detecting = phase === "detecting_friction";
  const notDetected = phase === "friction_not_detected";
  const frictionDetected = Boolean(decision?.detected);
  const dwellMinutes = features ? Math.max(1, Math.round(features.dwellSeconds / 60)) : 0;

  const title = noIssue
    ? "불편 없음으로 기록했어요"
    : detecting
      ? "합성 GPS 특징을 서버에서 판정하고 있어요"
      : notDetected
        ? "이상 행동 기준에 해당하지 않아요"
        : frictionDetected
          ? `${scenario?.label ?? "배송 마찰"}이 감지됐어요`
          : "배송 마찰을 자동으로 찾고 있어요";

  return (
    <section className="status-card" aria-live="polite">
      <div className="status-icon"><Crosshair weight="bold" aria-hidden="true" /></div>
      <div className="status-copy">
        <span className="live-dot" />
        <p className="eyebrow">
          {frictionDetected || detecting || notDetected
            ? "GPS 기반 이상 탐지"
            : "현장 신호 분석 준비"}
        </p>
        <h2>{title}</h2>
        <p>
          {decision?.reasons[0] ??
            (detecting
              ? "원본 좌표는 전송하지 않고 집계 특징만 사용합니다."
              : "왼쪽 또는 아래에서 핵심 시나리오를 선택해 보세요.")}
        </p>
      </div>
      {features && (frictionDetected || notDetected) ? (
        <div className="friction-metrics" aria-label="GPS 집계 결과">
          <span>{features.stopCount}회 정지</span>
          <span>{dwellMinutes}분 체류</span>
          <span>{Math.round(features.travelMeters)}m 이동</span>
        </div>
      ) : null}
      {phase === "friction_detected" || phase === "loading_questions" ? (
        <button
          type="button"
          className="primary-button status-action"
          disabled={phase === "loading_questions"}
          onClick={onCompleteDelivery}
        >
          {phase === "loading_questions" ? "질문을 준비하고 있어요" : "배송 완료했어요"}
        </button>
      ) : null}
      <div className="safe-strip">
        <ShieldCheck weight="fill" aria-hidden="true" />
        <span><strong>GPS 원본은 저장하지 않아요</strong><br />기기에서 계산한 집계 특징만 사용합니다.</span>
      </div>
    </section>
  );
}
