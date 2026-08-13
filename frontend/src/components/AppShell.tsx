import type { PropsWithChildren } from "react";
import { LockKey, Sparkle } from "@phosphor-icons/react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="page-frame">
      <aside className="desktop-story" aria-label="MileZero 소개">
        <div className="story-mark"><Sparkle weight="fill" aria-hidden="true" /></div>
        <p className="eyebrow">LAST 50 FEET INTELLIGENCE</p>
        <h2>한 기사의 경험이<br />다음 배송의 지름길이 됩니다.</h2>
        <p>
          GPS로 알 수 없는 출입구, 하역장, 진입 제한을 현장 경험으로 채우고
          독립 확인을 거쳐 안전한 운영 지식으로 전환합니다.
        </p>
        <div className="privacy-note">
          <LockKey weight="fill" aria-hidden="true" />
          <span><strong>개인정보는 저장하지 않아요.</strong><br />발견된 부분만 제거하고 현장 지식만 남깁니다.</span>
        </div>
      </aside>
      <main className="app-shell">{children}</main>
    </div>
  );
}
