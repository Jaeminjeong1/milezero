import { Buildings, MapPin, Truck } from "@phosphor-icons/react";

export function DeliveryCard() {
  return (
    <section className="delivery-card" aria-labelledby="current-delivery-title">
      <div className="section-label-row">
        <p className="eyebrow">현재 배송</p>
        <span className="demo-badge">합성 데이터 데모</span>
      </div>
      <div className="delivery-heading">
        <div className="place-icon"><Buildings weight="fill" aria-hidden="true" /></div>
        <div>
          <h2 id="current-delivery-title">센트럴시티 타워</h2>
          <p>1톤 · 배송지 100m 이내</p>
        </div>
      </div>
      <div className="route-line" aria-label="배송 진행 상태">
        <div className="route-step complete">
          <MapPin weight="fill" aria-hidden="true" />
          <span><strong>배송지 근방 진입</strong><small>오후 2:41</small></span>
        </div>
        <div className="route-step current">
          <Truck weight="fill" aria-hidden="true" />
          <span><strong>현장 이동 중</strong><small>경로 신호를 살펴보고 있어요</small></span>
        </div>
      </div>
    </section>
  );
}
