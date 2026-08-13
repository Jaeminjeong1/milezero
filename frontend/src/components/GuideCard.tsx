import {
  Buildings,
  CheckCircle,
  NavigationArrow,
  ShieldCheck,
  Truck,
} from "@phosphor-icons/react";

export function GuideCard({
  text,
  confidence,
  completed,
  onCompleteDelivery,
}: {
  text: string;
  confidence: number;
  completed: boolean;
  onCompleteDelivery(): void;
}) {
  return (
    <section className="guide-card" aria-labelledby="guide-title">
      <div className="guide-visual">
        <div className="building-node"><Buildings weight="fill" aria-hidden="true" /></div>
        <div className="route-dash" />
        <div className="entrance-node"><NavigationArrow weight="fill" aria-hidden="true" /></div>
      </div>
      <div className="guide-status">
        <span><CheckCircle weight="fill" aria-hidden="true" />기사 확인 완료</span>
        <strong>신뢰도 {Math.round(confidence * 100)}%</strong>
      </div>
      <h2 id="guide-title">출발 전 현장 가이드</h2>
      <div className="guide-action-text"><small>권장 진입·하역</small><strong>{text}</strong></div>
      <div className="guide-meta"><span>1톤 차량</span><span>검증된 정보</span><span>합성 시나리오</span></div>
      <div className="guide-policy">
        <ShieldCheck weight="fill" aria-hidden="true" />
        <span>정보가 다르다는 <strong>독립 확인 2건</strong>이 쌓이면 안내를 중단하고 새 후보를 다시 검증해요.</span>
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={completed}
        onClick={onCompleteDelivery}
      >
        <Truck weight="fill" aria-hidden="true" />
        {completed ? "배송 완료 · 현장 확인 중" : "배송 완료했어요"}
      </button>
    </section>
  );
}
