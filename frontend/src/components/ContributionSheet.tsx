import { useState } from "react";
import { Camera, CheckCircle, Microphone, ShieldCheck } from "@phosphor-icons/react";
import type { QuestionAnswer } from "../types";

export function ContributionSheet({
  answers,
  onSubmit,
}: {
  answers: QuestionAnswer[];
  onSubmit(input: { text?: string; file?: File }): Promise<void>;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();

  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet contribution-sheet" role="dialog" aria-modal="true" aria-labelledby="contribution-title">
        <div className="sheet-handle" />
        <span className="selected-answer"><CheckCircle weight="fill" aria-hidden="true" />선택 답변 {answers.length}개</span>
        <h2 id="contribution-title">다음 기사에게<br />무엇을 알려주면 좋을까요?</h2>
        <p className="sheet-description">짧게 적거나 현장 사진·음성을 하나만 더해도 충분해요.</p>
        <div className="text-area-label">
          <label htmlFor="contribution-text">다음 기사에게 알려줄 내용</label>
          <textarea
            id="contribution-text"
            value={text}
            maxLength={2_000}
            rows={4}
            placeholder="예: 정문은 단속이 잦고, 후문으로 들어가면 B2 하역장이 있어요."
            onChange={(event) => setText(event.target.value)}
          />
          <small>{text.length}/2,000</small>
        </div>
        <div className="media-actions">
          <label className="media-button">
            <Camera weight="fill" aria-hidden="true" />
            <span>사진</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0])} />
          </label>
          <label className="media-button">
            <Microphone weight="fill" aria-hidden="true" />
            <span>음성</span>
            <input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4" onChange={(event) => setFile(event.target.files?.[0])} />
          </label>
          <span className="file-state">{file ? file.name : "선택 입력 · 최대 8MB"}</span>
        </div>
        <div className="privacy-inline"><ShieldCheck weight="fill" aria-hidden="true" /><span>개인정보가 보여도 다시 묻지 않아요.<br /><strong>해당 부분만 제거하고 저장합니다.</strong></span></div>
        <button type="button" className="primary-button" onClick={() => void onSubmit({ text, file })}>{text.trim() || file ? "경험 보내고 10P 받기" : "선택 답변만 보내고 10P 받기"}</button>
      </section>
    </div>
  );
}
