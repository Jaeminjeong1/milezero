import { Check, Question, X } from "@phosphor-icons/react";

export function PendingKnowledgeCard({
  text,
  loading,
  onConfirm,
  onContradict,
}: {
  text: string;
  loading: boolean;
  onConfirm(): void;
  onContradict(): void;
}) {
  return (
    <section className="pending-card" aria-labelledby="pending-title">
      <div className="pending-icon"><Question weight="bold" aria-hidden="true" /></div>
      <p className="eyebrow">독립 기사 확인</p>
      <h2 id="pending-title">현재도 맞나요?</h2>
      <blockquote>{text}</blockquote>
      <p>이전 기사의 제보를 한 번만 확인하면 다음 배송부터 검증된 가이드로 사용할 수 있어요.</p>
      <div className="binary-actions">
        <button type="button" className="confirm-button" disabled={loading} onClick={onConfirm}><Check weight="bold" aria-hidden="true" />맞아요</button>
        <button type="button" className="subtle-button" disabled={loading} onClick={onContradict}><X weight="bold" aria-hidden="true" />정보가 달라요</button>
      </div>
    </section>
  );
}
