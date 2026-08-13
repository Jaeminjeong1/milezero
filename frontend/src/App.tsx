import { useState } from "react";
import { Bell, NavigationArrow } from "@phosphor-icons/react";

import type { MileZeroApi } from "./types";
import { AppShell } from "./components/AppShell";
import { ContributionSheet } from "./components/ContributionSheet";
import { DeliveryCard } from "./components/DeliveryCard";
import { ErrorSheet } from "./components/ErrorSheet";
import { ProcessingSheet } from "./components/ProcessingSheet";
import { QuestionSheet } from "./components/QuestionSheet";
import { ReporterProgress } from "./components/ReporterProgress";
import { RewardSheet } from "./components/RewardSheet";
import { RoleHero } from "./components/RoleHero";
import { StatusCard } from "./components/StatusCard";
import { TopTabs, type DeliveryTab } from "./components/TopTabs";
import { useReporterJourney } from "./hooks/useReporterJourney";

export function App({
  api,
  autoDetectDelayMs = 1_100,
}: {
  api: MileZeroApi;
  autoDetectDelayMs?: number;
}) {
  const [tab, setTab] = useState<DeliveryTab>("reporter");
  const reporter = useReporterJourney(api, { autoDetectDelayMs });

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
      <div className="app-content">
        <RoleHero
          tag={
            tab === "reporter"
              ? "현장 경험을 등록하고 보상받아요"
              : "출발 전 검증된 경험을 확인해요"
          }
        />
        {tab === "reporter" ? (
          <div className="role-content">
            <ReporterProgress phase={reporter.phase} />
            <DeliveryCard />
            <StatusCard
              phase={reporter.phase}
              onCompleteDelivery={() => void reporter.completeDelivery()}
              onReplay={reporter.replay}
            />
          </div>
        ) : (
          <section className="receiver-placeholder">
            <NavigationArrow weight="fill" aria-hidden="true" />
            <h2>검증된 현장 가이드를 준비했어요</h2>
            <p>배송 출발 전이나 배송지 근처에서 필요한 정보만 먼저 보여드려요.</p>
          </section>
        )}
      </div>
      {tab === "reporter" &&
      reporter.phase === "asking" &&
      reporter.currentQuestion &&
      reporter.questionPlan ? (
        <QuestionSheet
          item={reporter.currentQuestion}
          current={reporter.currentQuestionIndex + 1}
          total={reporter.questionPlan.questions.length}
          onSelect={reporter.selectAnswer}
        />
      ) : null}
      {tab === "reporter" && reporter.phase === "optional_detail" ? (
        <ContributionSheet
          answers={reporter.answers}
          onSubmit={reporter.submitContribution}
        />
      ) : null}
      {reporter.phase === "submitting" ? <ProcessingSheet /> : null}
      {tab === "reporter" && reporter.phase === "rewarded" && reporter.receipt ? (
        <RewardSheet
          points={reporter.receipt.awardedPoints}
          onNext={() => setTab("receiver")}
        />
      ) : null}
      {reporter.phase === "error" && reporter.errorMessage ? (
        <ErrorSheet message={reporter.errorMessage} onRetry={() => void reporter.retry()} />
      ) : null}
    </AppShell>
  );
}
