import {
  ArrowCounterClockwise,
  Clock,
  Crosshair,
  Path,
  Signpost,
} from "@phosphor-icons/react";

import { GPS_SCENARIO_LIST, type GpsScenarioId } from "../gps/scenarios";

const ICONS = {
  WANDERING: Path,
  LONG_STOP: Clock,
  ACCESS_RETRY: Signpost,
} as const;

export function GpsSimulationPanel({
  selectedId,
  loading,
  resetting,
  notice,
  onSelect,
  onReset,
}: {
  selectedId?: GpsScenarioId;
  loading: boolean;
  resetting: boolean;
  notice?: string;
  onSelect(id: GpsScenarioId): void;
  onReset(): void;
}) {
  return (
    <section className="gps-simulation-panel" aria-label="GPS 이상 탐지 시뮬레이션">
      <div className="simulation-heading">
        <span><Crosshair weight="bold" aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">JUDGE SIMULATION</p>
          <h3>GPS 이상 상황을 선택해 보세요</h3>
        </div>
      </div>
      <p className="simulation-description">
        합성 좌표를 브라우저에서 집계한 뒤 원본 좌표 없이 서버 규칙으로 판정합니다.
      </p>
      <div className="scenario-list">
        {GPS_SCENARIO_LIST.map((scenario) => {
          const Icon = ICONS[scenario.id];
          const selected = selectedId === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={selected}
              disabled={loading || resetting}
              onClick={() => onSelect(scenario.id)}
            >
              <Icon weight={selected ? "fill" : "bold"} aria-hidden="true" />
              <span>
                <strong>{scenario.label}</strong>
                <small>{scenario.description}</small>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="simulation-reset"
        disabled={resetting}
        onClick={onReset}
      >
        <ArrowCounterClockwise weight="bold" aria-hidden="true" />
        {resetting ? "데이터를 정리하고 있어요" : "처음부터 다시"}
      </button>
      {notice ? <p className="simulation-notice" role="status">{notice}</p> : null}
    </section>
  );
}
