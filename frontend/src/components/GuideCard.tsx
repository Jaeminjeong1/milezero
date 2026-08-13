import {
  Buildings,
  CheckCircle,
  Clock,
  NavigationArrow,
  ShieldCheck,
  Truck,
} from "@phosphor-icons/react";

import type {
  DeliveryKnowledgeItem,
  KnowledgeClaimType,
  VehicleType,
} from "../types";

export function GuideCard({
  guide,
  completed,
  onCompleteDelivery,
}: {
  guide: DeliveryKnowledgeItem;
  completed: boolean;
  onCompleteDelivery(): void;
}) {
  const label = claimLabels[guide.type];
  const vehicle = vehicleLabels[guide.vehicleType];

  return (
    <section className="guide-card" aria-labelledby="guide-title">
      <div className="guide-visual">
        <div className="building-node"><Buildings weight="fill" aria-hidden="true" /></div>
        <div className="route-dash" />
        <div className="entrance-node"><NavigationArrow weight="fill" aria-hidden="true" /></div>
      </div>
      <div className="guide-status">
        <span><CheckCircle weight="fill" aria-hidden="true" />기사 제보 · 독립 확인 완료</span>
        <strong>신뢰도 {Math.round(guide.confidence * 100)}%</strong>
      </div>
      <h2 id="guide-title">출발 전 현장 가이드</h2>
      <div className="guide-action-text">
        <small>{label}</small>
        <strong>{guide.text}</strong>
      </div>
      <div className="guide-meta" aria-label="안내 적용 조건">
        <span>{vehicle}</span>
        {guide.timeCondition ? <span><Clock weight="bold" aria-hidden="true" />{guide.timeCondition}</span> : null}
        <span>검증된 정보</span>
      </div>
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

const claimLabels: Record<KnowledgeClaimType, string> = {
  ENTRANCE_RECOMMENDATION: "추천 진입 경로",
  UNLOADING_LOCATION: "추천 하역 위치",
  VEHICLE_RESTRICTION: "차량 진입 조건",
  ACCESS_PROCEDURE: "출입 절차",
  ELEVATOR_GUIDE: "엘리베이터 이용 안내",
  INTERNAL_ROUTE: "건물 내부 경로",
};

const vehicleLabels: Record<VehicleType, string> = {
  ALL: "모든 차량",
  BIKE: "이륜차",
  CAR: "승용차",
  VAN: "승합차",
  "1TON": "1톤 차량",
};
