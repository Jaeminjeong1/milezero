import { useState } from "react";
import { ArrowClockwise, Bell } from "@phosphor-icons/react";

import type { MileZeroApi } from "./types";
import { AppShell } from "./components/AppShell";
import { DeliveryCard } from "./components/DeliveryCard";
import { StatusCard } from "./components/StatusCard";
import { TopTabs, type DeliveryTab } from "./components/TopTabs";

export function App({
  api: _api,
  autoDetectDelayMs: _autoDetectDelayMs = 1_100,
}: {
  api: MileZeroApi;
  autoDetectDelayMs?: number;
}) {
  const [tab, setTab] = useState<DeliveryTab>("today");
  const [replayKey, setReplayKey] = useState(0);

  return (
    <AppShell>
      <TopTabs active={tab} onChange={setTab} />
      <header className="app-header">
        <div>
          <p className="brand-kicker">MOVE SMARTER</p>
          <h1>MileZero</h1>
        </div>
        <button type="button" className="icon-button" aria-label="알림">
          <Bell weight="bold" aria-hidden="true" />
        </button>
      </header>
      <div className="app-content" key={replayKey}>
        {tab === "today" ? (
          <>
            <section className="hero-copy">
              <span className="hero-tag">배송지에 거의 다 왔어요</span>
              <h2>마지막 구간은<br /><em>현장 경험</em>이 안내할게요.</h2>
            </section>
            <DeliveryCard />
            <StatusCard onReplay={() => setReplayKey((key) => key + 1)} />
          </>
        ) : (
          <section className="empty-next">
            <ArrowClockwise weight="bold" aria-hidden="true" />
            <h2>다음 배송 가이드를 준비하고 있어요</h2>
            <p>오늘의 현장 경험을 보내면 독립 확인 뒤 이곳에 표시됩니다.</p>
            <button type="button" className="secondary-button" onClick={() => setTab("today")}>오늘 배송으로 돌아가기</button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
