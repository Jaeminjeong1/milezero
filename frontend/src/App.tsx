import { useState } from "react";
import { Bell } from "@phosphor-icons/react";

import type { MileZeroApi } from "./types";
import { AppShell } from "./components/AppShell";
import { ContributionSheet } from "./components/ContributionSheet";
import { DeliveryCard } from "./components/DeliveryCard";
import { ErrorSheet } from "./components/ErrorSheet";
import { GuideCard } from "./components/GuideCard";
import { ProcessingSheet } from "./components/ProcessingSheet";
import { QuestionSheet } from "./components/QuestionSheet";
import { ReporterProgress } from "./components/ReporterProgress";
import { ReceiverFeedbackSheet } from "./components/ReceiverFeedbackSheet";
import { ReceiverProgress } from "./components/ReceiverProgress";
import { RewardSheet } from "./components/RewardSheet";
import { RoleHero } from "./components/RoleHero";
import { StatusCard } from "./components/StatusCard";
import { TopTabs, type DeliveryTab } from "./components/TopTabs";
import { useReporterJourney } from "./hooks/useReporterJourney";
import { useReceiverJourney } from "./hooks/useReceiverJourney";

export function App({
  api,
  autoDetectDelayMs = 1_100,
}: {
  api: MileZeroApi;
  autoDetectDelayMs?: number;
}) {
  const [tab, setTab] = useState<DeliveryTab>("reporter");
  const reporter = useReporterJourney(api, { autoDetectDelayMs });
  const receiver = useReceiverJourney(api);

  const changeTab = (nextTab: DeliveryTab) => {
    setTab(nextTab);
    if (nextTab === "receiver" && receiver.phase === "idle") {
      void receiver.openGuide();
    }
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
        ) : receiver.phase === "loading_guide" || receiver.phase === "idle" ? (
          <section className="loading-next" role="status">
            <span className="loading-ring" />
            <h2>검증된 현장 지식을 불러오고 있어요</h2>
          </section>
        ) : receiver.guide ? (
          <div className="role-content receiver-content">
            <ReceiverProgress phase={receiver.phase} />
            <GuideCard
              guide={receiver.guide}
              completed={receiver.phase !== "guide_ready"}
              onCompleteDelivery={receiver.completeDelivery}
            />
          </div>
        ) : (
          <section className="receiver-placeholder">
            <h2>확인된 현장 가이드가 아직 없어요</h2>
            <p>다른 기사들의 독립 확인이 끝나면 이곳에서 안내할게요.</p>
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
          onNext={() => changeTab("receiver")}
        />
      ) : null}
      {tab === "reporter" && reporter.phase === "error" && reporter.errorMessage ? (
        <ErrorSheet message={reporter.errorMessage} onRetry={() => void reporter.retry()} />
      ) : null}
      {tab === "receiver" &&
      (receiver.phase === "fact_feedback" ||
        receiver.phase === "utility_feedback" ||
        receiver.phase === "feedback_complete") &&
      receiver.guide ? (
        <ReceiverFeedbackSheet
          guideText={receiver.guide.text}
          phase={receiver.phase}
          loading={receiver.feedbackLoading}
          completionMessage={receiver.completionMessage}
          onFact={(feedback) => void receiver.answerFact(feedback)}
          onUtility={(feedback) => void receiver.answerUtility(feedback)}
        />
      ) : null}
      {tab === "receiver" && receiver.phase === "error" && receiver.errorMessage ? (
        <ErrorSheet
          message={receiver.errorMessage}
          onRetry={() => void receiver.retryFeedback()}
        />
      ) : null}
    </AppShell>
  );
}
