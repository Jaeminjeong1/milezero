import { Crosshair, ShieldCheck } from "@phosphor-icons/react";

export function StatusCard({ onReplay }: { onReplay(): void }) {
  return (
    <section className="status-card" aria-live="polite">
      <div className="status-icon"><Crosshair weight="bold" aria-hidden="true" /></div>
      <div className="status-copy">
        <span className="live-dot" />
        <p className="eyebrow">현장 신호 분석 중</p>
        <h2>배송 마찰을 자동으로 찾고 있어요</h2>
        <p>정지 3회 · 체류 7분 · 짧은 반복 이동</p>
      </div>
      <button type="button" className="text-button" onClick={onReplay}>데모 다시 보기</button>
      <div className="safe-strip">
        <ShieldCheck weight="fill" aria-hidden="true" />
        <span><strong>GPS 원본은 저장하지 않아요</strong><br />기기에서 계산한 집계 특징만 사용합니다.</span>
      </div>
    </section>
  );
}
