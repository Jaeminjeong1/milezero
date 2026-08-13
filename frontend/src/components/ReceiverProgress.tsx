import { CheckCircle, Database, NavigationArrow, Truck } from "@phosphor-icons/react";

import type { ReceiverPhase } from "../hooks/useReceiverJourney";

const steps = [
  { label: "배송 중", icon: NavigationArrow },
  { label: "배송 완료", icon: Truck },
  { label: "사실·도움 확인", icon: CheckCircle },
  { label: "지식 갱신", icon: Database },
] as const;

const progressByPhase: Record<ReceiverPhase, number> = {
  idle: 0,
  loading_guide: 0,
  pending_confirmation: 0,
  guide_ready: 0,
  fact_feedback: 1,
  utility_feedback: 2,
  feedback_complete: 3,
  error: 2,
};

export function ReceiverProgress({ phase }: { phase: ReceiverPhase }) {
  const progress = progressByPhase[phase];
  return (
    <ol className="journey-progress receiver-progress" aria-label="도움 받는 기사 워크플로우">
      {steps.map(({ label, icon: Icon }, index) => (
        <li
          key={label}
          className={index < progress ? "complete" : index === progress ? "current" : ""}
        >
          <Icon weight={index <= progress ? "fill" : "regular"} aria-hidden="true" />
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
