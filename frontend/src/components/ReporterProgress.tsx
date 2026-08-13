import {
  CheckCircle,
  Coins,
  Crosshair,
  Package,
  Question,
} from "@phosphor-icons/react";

import type { ReporterPhase } from "../hooks/useReporterJourney";

const steps = [
  { label: "배송 중", icon: Package },
  { label: "GPS 마찰 감지", icon: Crosshair },
  { label: "배송 완료 후 질문", icon: Question },
  { label: "경험 등록", icon: CheckCircle },
  { label: "포인트 적립", icon: Coins },
] as const;

const progressByPhase: Record<ReporterPhase, number> = {
  delivering: 0,
  detecting_friction: 0,
  friction_detected: 1,
  friction_not_detected: 1,
  loading_questions: 2,
  asking: 2,
  optional_detail: 3,
  submitting: 3,
  rewarded: 4,
  no_issue: 2,
  error: 2,
};

export function ReporterProgress({ phase }: { phase: ReporterPhase }) {
  const progress = progressByPhase[phase];
  return (
    <ol className="journey-progress" aria-label="등록하는 기사 워크플로우">
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
