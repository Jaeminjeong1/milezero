import { ChatCenteredDots, MapPinLine } from "@phosphor-icons/react";

import type { QuestionItem } from "../types";

export function QuestionSheet({
  item,
  current,
  total,
  onSelect,
}: {
  item: QuestionItem;
  current: number;
  total: number;
  onSelect(choice: string): void;
}) {
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="question-title">
        <div className="sheet-handle" />
        <div className="sheet-context">
          <span><MapPinLine weight="fill" aria-hidden="true" />현장 마찰이 감지됐어요</span>
          <small>{current}/{total}</small>
        </div>
        <div className="sheet-title-icon"><ChatCenteredDots weight="fill" aria-hidden="true" /></div>
        <h2 id="question-title">{item.question}</h2>
        <p className="sheet-description">기사님의 잘못을 묻는 것이 아니에요. 배송지 때문에 생긴 불편을 남기면 다음 기사를 보호할 수 있어요.</p>
        <div className="choice-list">
          {item.choices.map((choice) => (
            <button key={choice} type="button" onClick={() => onSelect(choice)}>{choice}<span aria-hidden="true">›</span></button>
          ))}
        </div>
      </section>
    </div>
  );
}
