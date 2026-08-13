import { Brain, Check, Database, ShieldCheck, Sparkle } from "@phosphor-icons/react";

const steps = [
  { label: "응답 이해", icon: Brain },
  { label: "개인정보 제거", icon: ShieldCheck },
  { label: "운영 지식 구조화", icon: Sparkle },
  { label: "후보 지식 저장", icon: Database },
];

export function ProcessingSheet() {
  return (
    <div className="sheet-backdrop processing-backdrop">
      <section className="bottom-sheet processing-sheet" role="status" aria-live="polite">
        <div className="sheet-handle" />
        <div className="processing-orbit"><Sparkle weight="fill" aria-hidden="true" /></div>
        <p className="eyebrow">GEMINI MULTIMODAL</p>
        <h2>현장 경험에서<br />쓸모 있는 지식을 찾고 있어요</h2>
        <div className="processing-steps">
          {steps.map(({ label, icon: Icon }, index) => (
            <div className="processing-step" key={label} style={{ "--step-delay": `${index * 240}ms` } as React.CSSProperties}>
              <Icon weight="fill" aria-hidden="true" /><span>{label}</span><Check className="step-check" weight="bold" aria-hidden="true" />
            </div>
          ))}
        </div>
        <p className="processing-footnote">원본 사진과 음성은 분석 후 저장하지 않습니다.</p>
      </section>
    </div>
  );
}
