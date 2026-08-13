import { WarningCircle } from "@phosphor-icons/react";

export function ErrorSheet({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet error-sheet" role="alertdialog" aria-modal="true" aria-labelledby="error-title">
        <div className="sheet-handle" />
        <WarningCircle weight="fill" aria-hidden="true" />
        <h2 id="error-title">제보를 보내지 못했어요</h2>
        <p>{message}</p>
        <button type="button" className="primary-button" onClick={onRetry}>같은 내용으로 다시 시도</button>
      </section>
    </div>
  );
}
