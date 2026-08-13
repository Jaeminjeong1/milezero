import { Coins, TrendUp } from "@phosphor-icons/react";

export function PointsSummary({ points }: { points: number }) {
  return (
    <section className="points-summary" aria-label="제보자 보상 현황">
      <div><Coins weight="fill" aria-hidden="true" /><span><small>제보자 보상</small><strong>누적 {points}P</strong></span></div>
      <span className="points-growth"><TrendUp weight="bold" aria-hidden="true" />검증할수록 성장</span>
    </section>
  );
}
