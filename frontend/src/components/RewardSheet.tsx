import { ArrowRight, CheckCircle, Coins, ShieldCheck } from "@phosphor-icons/react";

export function RewardSheet({ points, onNext }: { points: number; onNext(): void }) {
  return (
    <div className="sheet-backdrop reward-backdrop">
      <section className="bottom-sheet reward-sheet" role="dialog" aria-modal="true" aria-labelledby="reward-title">
        <div className="sheet-handle" />
        <div className="reward-coin"><Coins weight="fill" aria-hidden="true" /></div>
        <p className="eyebrow">경험 등록 완료</p>
        <h2 id="reward-title">{points}P가 바로 쌓였어요</h2>
        <p>다른 기사가 사실을 확인하면 <strong>20P</strong>, 실제 도움이 되면 <strong>5P</strong>가 더 쌓여요.</p>
        <div className="knowledge-preview"><span><CheckCircle weight="fill" aria-hidden="true" />후보 지식</span><strong>1톤 차량은 후문으로 진입</strong><small>독립 기사 확인을 기다리고 있어요</small></div>
        <div className="removed-note"><ShieldCheck weight="fill" aria-hidden="true" /><span>연락처 등 개인정보는 제거하고<br />배송지 운영 정보만 남겼어요.</span></div>
        <button type="button" className="primary-button" onClick={onNext}>다음 기사 화면에서 확인하기<ArrowRight weight="bold" aria-hidden="true" /></button>
      </section>
    </div>
  );
}
