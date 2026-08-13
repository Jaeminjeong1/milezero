import { useState } from "react";
import { ArrowClockwise, Bell } from "@phosphor-icons/react";

import type { MileZeroApi } from "./types";
import { AppShell } from "./components/AppShell";
import { DeliveryCard } from "./components/DeliveryCard";
import { ContributionSheet } from "./components/ContributionSheet";
import { ErrorSheet } from "./components/ErrorSheet";
import { ProcessingSheet } from "./components/ProcessingSheet";
import { GuideCard } from "./components/GuideCard";
import { PendingKnowledgeCard } from "./components/PendingKnowledgeCard";
import { PointsSummary } from "./components/PointsSummary";
import { QuestionSheet } from "./components/QuestionSheet";
import { RewardSheet } from "./components/RewardSheet";
import { StatusCard } from "./components/StatusCard";
import { TopTabs, type DeliveryTab } from "./components/TopTabs";
import { useDemoJourney } from "./hooks/useDemoJourney";

export function App({
  api,
  autoDetectDelayMs = 1_100,
}: {
  api: MileZeroApi;
  autoDetectDelayMs?: number;
}) {
  const [tab, setTab] = useState<DeliveryTab>("today");
  const journey = useDemoJourney(api, { autoDetectDelayMs });

  const changeTab = (nextTab: DeliveryTab) => {
    setTab(nextTab);
    if (nextTab === "next") void journey.openNextDelivery();
  };

  return (
    <AppShell>
      <TopTabs active={tab} onChange={changeTab} />
      <header className="app-header">
        <div>
          <p className="brand-kicker">MOVE SMARTER</p>
          <h1>MileZero</h1>
        </div>
        <button type="button" className="icon-button" aria-label="알림">
          <Bell weight="bold" aria-hidden="true" />
        </button>
      </header>
      <div className="app-content">
        {tab === "today" ? (
          <>
            <section className="hero-copy">
              <span className="hero-tag">배송지에 거의 다 왔어요</span>
              <h2>마지막 구간은<br /><em>현장 경험</em>이 안내할게요.</h2>
            </section>
            <DeliveryCard />
            <StatusCard onReplay={journey.replay} />
          </>
        ) : journey.knowledgeLoading && !journey.knowledge ? (
          <section className="loading-next" role="status"><span className="loading-ring" /><h2>현장 지식을 불러오고 있어요</h2></section>
        ) : journey.knowledge?.pendingConfirmation ? (
          <div className="next-delivery-content">
            <div className="next-heading"><span className="hero-tag">새로운 배송 · 기사 B</span><h2>센트럴시티 타워<br />현장 정보를 확인해 주세요.</h2></div>
            <PointsSummary points={journey.totalPoints} />
            <PendingKnowledgeCard
              text={journey.knowledge.pendingConfirmation.text}
              loading={journey.knowledgeLoading}
              onConfirm={() => void journey.confirmPending("CONFIRM")}
              onContradict={() => void journey.confirmPending("CONTRADICT")}
            />
          </div>
        ) : journey.knowledge?.items[0] ? (
          <div className="next-delivery-content">
            <div className="next-heading"><span className="hero-tag">다음 배송 · 기사 C</span><h2>도착 전에 필요한 정보만<br />먼저 확인하세요.</h2></div>
            <PointsSummary points={journey.totalPoints} />
            <GuideCard
              text={journey.knowledge.items[0].text}
              confidence={journey.knowledge.items[0].confidence}
              feedback={journey.guideFeedback as "HELPFUL" | "CONTRADICT" | undefined}
              loading={journey.knowledgeLoading}
              onHelpful={() => void journey.rateGuide("HELPFUL")}
              onChanged={() => void journey.rateGuide("CONTRADICT")}
            />
          </div>
        ) : (
          <section className="empty-next">
            <ArrowClockwise weight="bold" aria-hidden="true" />
            <h2>다음 배송 가이드를 준비하고 있어요</h2>
            <p>오늘의 현장 경험을 보내면 독립 확인 뒤 이곳에 표시됩니다.</p>
            <button type="button" className="secondary-button" onClick={() => setTab("today")}>오늘 배송으로 돌아가기</button>
          </section>
        )}
      </div>
      {tab === "today" && journey.phase === "question" && journey.question ? (
        <QuestionSheet question={journey.question} onSelect={journey.selectChoice} />
      ) : null}
      {tab === "today" && journey.phase === "contribution" && journey.selectedChoice ? (
        <ContributionSheet choice={journey.selectedChoice} onSubmit={journey.submitContribution} />
      ) : null}
      {journey.phase === "submitting" ? <ProcessingSheet /> : null}
      {tab === "today" && journey.phase === "rewarded" && journey.receipt ? (
        <RewardSheet points={journey.receipt.awardedPoints} onNext={() => changeTab("next")} />
      ) : null}
      {journey.phase === "error" && journey.errorMessage ? (
        <ErrorSheet message={journey.errorMessage} onRetry={() => void journey.retrySubmission()} />
      ) : null}
    </AppShell>
  );
}
