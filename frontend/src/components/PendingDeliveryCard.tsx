import {
  Buildings,
  NavigationArrow,
  ShieldWarning,
  Truck,
} from "@phosphor-icons/react";

export function PendingDeliveryCard({
  text,
  completed,
  onCompleteDelivery,
}: {
  text: string;
  completed: boolean;
  onCompleteDelivery(): void;
}) {
  return (
    <section className="guide-card pending-delivery-card" aria-labelledby="pending-delivery-title">
      <div className="guide-visual">
        <div className="building-node"><Buildings weight="fill" aria-hidden="true" /></div>
        <div className="route-dash" />
        <div className="entrance-node"><NavigationArrow weight="fill" aria-hidden="true" /></div>
      </div>
      <div className="guide-status pending-guide-status">
        <span><ShieldWarning weight="fill" aria-hidden="true" />이전 기사 제보 · 검증 대기</span>
        <strong>현장 확인 전</strong>
      </div>
      <h2 id="pending-delivery-title">배송 중 현장 정보</h2>
      <div className="guide-action-text">
        <small>이전 기사가 남긴 정보</small>
        <strong>{text}</strong>
      </div>
      <div className="guide-meta" aria-label="안내 적용 조건">
        <span>1톤 차량</span>
        <span>검증 대기 정보</span>
      </div>
      <div className="guide-policy pending-guide-policy">
        <ShieldWarning weight="fill" aria-hidden="true" />
        <span>아직 독립 확인 전인 정보예요. 배송을 마친 뒤 <strong>사실 여부와 도움 여부</strong>를 확인해 주세요.</span>
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
